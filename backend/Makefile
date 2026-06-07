.PHONY: build run clean test deps

# Binary name
BINARY=lsp-bridge

# Build the server
build:
	go build -o $(BINARY) ./cmd/lsp-bridge

# Run the server
run: build
	./$(BINARY)

# Run with debug logging
debug: build
	DEBUG=1 ./$(BINARY)

# Run on custom port
run-port: build
	./$(BINARY) -addr :$(PORT)

# Clean build artifacts
clean:
	rm -f $(BINARY)
	go clean

# Run tests
test:
	go test -v ./...

# Download dependencies
deps:
	go mod download
	go mod tidy

# Check if language servers are installed
check-deps:
	@echo "Checking language server dependencies..."
	@which gopls > /dev/null && echo "✓ gopls installed" || echo "✗ gopls not found (install: go install golang.org/x/tools/gopls@latest)"
	@which typescript-language-server > /dev/null && echo "✓ typescript-language-server installed" || echo "✗ typescript-language-server not found (install: npm i -g typescript-language-server typescript)"
	@which pylsp > /dev/null && echo "✓ pylsp installed" || echo "✗ pylsp not found (install: pip install python-lsp-server)"

# Build for different platforms
build-all:
	GOOS=linux GOARCH=amd64 go build -o $(BINARY)-linux-amd64 ./cmd/lsp-bridge
	GOOS=darwin GOARCH=amd64 go build -o $(BINARY)-darwin-amd64 ./cmd/lsp-bridge
	GOOS=darwin GOARCH=arm64 go build -o $(BINARY)-darwin-arm64 ./cmd/lsp-bridge
	GOOS=windows GOARCH=amd64 go build -o $(BINARY)-windows-amd64.exe ./cmd/lsp-bridge

# Install to GOPATH/bin
install: build
	cp $(BINARY) $(GOPATH)/bin/

# Format code
fmt:
	go fmt ./...

# Lint code
lint:
	golangci-lint run
