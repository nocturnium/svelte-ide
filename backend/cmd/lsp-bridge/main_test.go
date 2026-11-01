package main

import (
	"flag"
	"testing"
)

func TestListenAddressHelpers(t *testing.T) {
	loopback := map[string]bool{
		"127.0.0.1:8765": true,
		"localhost:8765": true,
		"[::1]:8765":     true,
		":8765":          false,
		"0.0.0.0:8765":   false,
		"10.0.0.5:8765":  false,
	}
	for addr, want := range loopback {
		if got := isLoopbackAddr(addr); got != want {
			t.Errorf("isLoopbackAddr(%q) = %v, want %v", addr, got, want)
		}
	}
	if got := displayAddr(":9000"); got != "localhost:9000" {
		t.Errorf("displayAddr(:9000) = %q", got)
	}
}

// The default must not expose the bridge to the network.
func TestDefaultAddrIsLoopback(t *testing.T) {
	fs := flag.NewFlagSet("t", flag.ContinueOnError)
	addr := fs.String("addr", defaultAddr, "")
	if !isLoopbackAddr(*addr) {
		t.Fatalf("default -addr %q is not loopback", *addr)
	}
}
