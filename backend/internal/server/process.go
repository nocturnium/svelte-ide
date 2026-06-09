package server

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

// Process manages a running language server process.
type Process struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stdout   io.ReadCloser
	stderr   io.ReadCloser
	config   Config
	mu       sync.Mutex
	running  bool
	messages chan json.RawMessage
	errors   chan error
	ctx      context.Context
	cancel   context.CancelFunc
	done     chan struct{}
	doneOnce sync.Once
	readers  sync.WaitGroup
	waiter   sync.WaitGroup
}

// NewProcess creates a new language server process (but doesn't start it).
func NewProcess(cfg Config) *Process {
	ctx, cancel := context.WithCancel(context.Background())
	return &Process{
		config:   cfg,
		messages: make(chan json.RawMessage, 100),
		errors:   make(chan error, 10),
		ctx:      ctx,
		cancel:   cancel,
		done:     make(chan struct{}),
	}
}

// Start spawns the language server process.
func (p *Process) Start() error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.running {
		return fmt.Errorf("process already running")
	}

	p.cmd = exec.CommandContext(p.ctx, p.config.Command, p.config.Args...)

	var err error
	p.stdin, err = p.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	p.stdout, err = p.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	p.stderr, err = p.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := p.cmd.Start(); err != nil {
		return fmt.Errorf("failed to start process: %w", err)
	}

	p.running = true
	log.Printf("[LSP] Started %s (PID: %d)", p.config.Command, p.cmd.Process.Pid)

	// Start reading stdout (LSP messages)
	p.readers.Add(1)
	go func() {
		defer p.recoverGoroutine("readMessages")
		defer p.readers.Done()
		p.readMessages()
	}()

	// Start reading stderr (for debugging)
	p.readers.Add(1)
	go func() {
		defer p.recoverGoroutine("readStderr")
		defer p.readers.Done()
		p.readStderr()
	}()

	// Wait for process to exit
	p.waiter.Add(1)
	go func() {
		defer p.recoverGoroutine("waitForExit")
		defer p.waiter.Done()
		p.waitForExit()
	}()

	return nil
}

// Stop gracefully shuts down the language server.
func (p *Process) Stop() error {
	p.mu.Lock()
	running := p.running
	started := p.cmd != nil
	if !running {
		p.mu.Unlock()
		if started {
			p.waiter.Wait()
		}
		return nil
	}

	p.cancel()

	if p.stdin != nil {
		p.stdin.Close()
	}

	if p.cmd != nil && p.cmd.Process != nil {
		p.cmd.Process.Kill()
	}

	p.running = false
	p.mu.Unlock()

	p.waiter.Wait()
	return nil
}

// Send writes an LSP message to the language server.
func (p *Process) Send(msg json.RawMessage) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.running {
		return fmt.Errorf("process not running")
	}

	// Format as LSP message with Content-Length header
	content := string(msg)
	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(content))

	if _, err := p.stdin.Write([]byte(header + content)); err != nil {
		return fmt.Errorf("failed to write to stdin: %w", err)
	}

	return nil
}

// Messages returns the channel for receiving LSP messages from the server.
func (p *Process) Messages() <-chan json.RawMessage {
	return p.messages
}

// Errors returns the channel for receiving process errors.
func (p *Process) Errors() <-chan error {
	return p.errors
}

// IsRunning returns whether the process is currently running.
func (p *Process) IsRunning() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.running
}

// readMessages reads LSP messages from stdout.
func (p *Process) readMessages() {
	reader := bufio.NewReader(p.stdout)

	for {
		select {
		case <-p.ctx.Done():
			return
		default:
		}

		// Read headers
		contentLength := 0
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					p.sendError(fmt.Errorf("failed to read header: %w", err))
				}
				return
			}

			line = strings.TrimSpace(line)
			if line == "" {
				break // End of headers
			}

			if strings.HasPrefix(line, "Content-Length:") {
				lenStr := strings.TrimSpace(strings.TrimPrefix(line, "Content-Length:"))
				contentLength, _ = strconv.Atoi(lenStr)
			}
		}

		if contentLength == 0 {
			continue
		}

		// Read content
		content := make([]byte, contentLength)
		_, err := io.ReadFull(reader, content)
		if err != nil {
			if err != io.EOF {
				p.sendError(fmt.Errorf("failed to read content: %w", err))
			}
			return
		}

		if !p.sendMessage(json.RawMessage(content)) {
			return
		}
	}
}

// readStderr reads and logs stderr output.
func (p *Process) readStderr() {
	scanner := bufio.NewScanner(p.stderr)
	for scanner.Scan() {
		log.Printf("[LSP stderr] %s", scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		p.sendError(fmt.Errorf("failed to read stderr: %w", err))
	}
}

// waitForExit waits for the process to exit and updates state.
func (p *Process) waitForExit() {
	err := p.cmd.Wait()

	p.mu.Lock()
	p.running = false
	p.mu.Unlock()

	if err != nil {
		log.Printf("[LSP] Process exited with error: %v", err)
		p.sendError(err)
	} else {
		log.Printf("[LSP] Process exited normally")
	}

	p.signalDone()
	p.readers.Wait()
	close(p.messages)
	close(p.errors)
}

func (p *Process) signalDone() {
	p.doneOnce.Do(func() {
		close(p.done)
	})
}

func (p *Process) sendMessage(msg json.RawMessage) bool {
	select {
	case p.messages <- msg:
		return true
	case <-p.done:
		return false
	case <-p.ctx.Done():
		return false
	default:
		log.Println("[LSP] Warning: message channel full, dropping message")
		return true
	}
}

func (p *Process) sendError(err error) bool {
	select {
	case p.errors <- err:
		return true
	case <-p.done:
		return false
	case <-p.ctx.Done():
		return false
	default:
		log.Printf("[LSP] Warning: error channel full, dropping error: %v", err)
		return true
	}
}

func (p *Process) recoverGoroutine(name string) {
	if r := recover(); r != nil {
		log.Printf("[LSP] Recovered panic in %s: %v", name, r)
	}
}
