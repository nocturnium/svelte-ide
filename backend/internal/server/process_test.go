package server

import (
	"encoding/json"
	"os/exec"
	"runtime"
	"sync"
	"testing"
	"time"
)

func TestProcessStopConcurrentWithIO(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("cat-based stdio process test is Unix-only")
	}
	if _, err := exec.LookPath("cat"); err != nil {
		t.Skip("cat is required for this test")
	}

	const iterations = 250
	for i := 0; i < iterations; i++ {
		p := NewProcess(Config{Command: "cat"})
		if err := p.Start(); err != nil {
			t.Fatalf("iteration %d: start process: %v", i, err)
		}

		var drainWG sync.WaitGroup
		drainWG.Add(2)
		go func() {
			defer drainWG.Done()
			for range p.Messages() {
			}
		}()
		go func() {
			defer drainWG.Done()
			for range p.Errors() {
			}
		}()

		var sendWG sync.WaitGroup
		for sender := 0; sender < 4; sender++ {
			sendWG.Add(1)
			go func() {
				defer sendWG.Done()
				for n := 0; n < 1000; n++ {
					msg := json.RawMessage(`{"jsonrpc":"2.0","id":1,"method":"test"}`)
					if err := p.Send(msg); err != nil {
						return
					}
					if n%25 == 0 {
						runtime.Gosched()
					}
				}
			}()
		}

		time.Sleep(time.Duration(i%5) * time.Microsecond)
		if err := p.Stop(); err != nil {
			t.Fatalf("iteration %d: stop process: %v", i, err)
		}
		sendWG.Wait()
		drainWG.Wait()
	}
}
