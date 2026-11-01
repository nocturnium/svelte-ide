//go:build !windows

package server

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func writeScript(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "lsp.sh")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func drain(p *Process) {
	go func() {
		for range p.Messages() {
		}
	}()
	go func() {
		for range p.Errors() {
		}
	}()
}

// A language server that never reads stdin used to block Send while holding
// the lifecycle mutex, so Stop never returned and the session slot leaked.
func TestStopReturnsWhileSendIsBlocked(t *testing.T) {
	p := NewProcess(Config{Command: writeScript(t, "exec sleep 600\n")})
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	drain(p)

	big := json.RawMessage(`"` + strings.Repeat("x", 1<<20) + `"`)
	sendDone := make(chan struct{})
	go func() {
		defer close(sendDone)
		for i := 0; i < 8; i++ { // well past the pipe buffer
			if p.Send(big) != nil {
				return
			}
		}
	}()
	time.Sleep(200 * time.Millisecond)

	stopped := make(chan struct{})
	go func() { _ = p.Stop(); close(stopped) }()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop blocked behind a Send to a server that is not reading stdin")
	}
	select {
	case <-sendDone:
	case <-time.After(5 * time.Second):
		t.Fatal("blocked Send was not released by Stop")
	}
}

// A negative Content-Length used to panic the reader goroutine silently and
// leave the process running with nobody reading its output.
func TestInvalidContentLengthEndsTheProcess(t *testing.T) {
	for _, header := range []string{"-5", "abc", "99999999999"} {
		t.Run(header, func(t *testing.T) {
			script := "printf 'Content-Length: " + header + "\\r\\n\\r\\n'\nexec sleep 600\n"
			p := NewProcess(Config{Command: writeScript(t, script)})
			if err := p.Start(); err != nil {
				t.Fatal(err)
			}
			go func() {
				for range p.Errors() {
				}
			}()
			select {
			case _, ok := <-p.Messages():
				for ok {
					_, ok = <-p.Messages()
				}
			case <-time.After(5 * time.Second):
				_ = p.Stop()
				t.Fatal("process kept running after an invalid Content-Length")
			}
			if p.IsRunning() {
				t.Fatal("process still marked running")
			}
		})
	}
}

// Helpers spawned by the language server must not outlive the session.
func TestStopKillsGrandchildren(t *testing.T) {
	pidFile := filepath.Join(t.TempDir(), "child.pid")
	script := "sleep 600 &\necho $! > " + pidFile + "\nexec sleep 600\n"
	p := NewProcess(Config{Command: writeScript(t, script)})
	if err := p.Start(); err != nil {
		t.Fatal(err)
	}
	drain(p)

	var child int
	deadline := time.Now().Add(5 * time.Second)
	for child == 0 && time.Now().Before(deadline) {
		if b, err := os.ReadFile(pidFile); err == nil && len(strings.TrimSpace(string(b))) > 0 {
			child, _ = strconv.Atoi(strings.TrimSpace(string(b)))
		}
		time.Sleep(20 * time.Millisecond)
	}
	if child == 0 {
		t.Fatal("grandchild never started")
	}
	_ = p.Stop()

	deadline = time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(child, 0); err != nil {
			return // gone
		}
		// A zombie reparented to init is reaped asynchronously; check state.
		if out, err := exec.Command("ps", "-o", "stat=", "-p", strconv.Itoa(child)).Output(); err == nil && strings.HasPrefix(strings.TrimSpace(string(out)), "Z") {
			return
		}
		time.Sleep(50 * time.Millisecond)
	}
	_ = syscall.Kill(child, syscall.SIGKILL)
	t.Fatalf("grandchild %d survived Stop", child)
}
