TAGS := webkit2_41
export PATH := $(HOME)/.local/go/bin:$(HOME)/go/bin:$(PATH)

.PHONY: build dev clean

build:
	wails build -tags $(TAGS)

dev:
	wails dev -tags $(TAGS)

clean:
	rm -rf build/bin
