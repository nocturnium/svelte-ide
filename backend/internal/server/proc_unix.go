//go:build !windows

package server

import (
	"os/exec"
	"syscall"
)

// configureProcessGroup starts the language server in its own process group so
// that helper processes it spawns can be terminated together with it.
func configureProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		killProcessTree(cmd)
		return nil
	}
}

// killProcessTree kills the language server and every process in its group.
func killProcessTree(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if err := syscall.Kill(-pid, syscall.SIGKILL); err != nil {
		_ = cmd.Process.Kill()
	}
}
