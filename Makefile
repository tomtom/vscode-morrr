NAME    := $(shell node -p "require('./package.json').name")
VERSION := $(shell node -p "require('./package.json').version")
VSIX    := $(NAME)-$(VERSION).vsix

.PHONY: vsix install push

vsix: $(VSIX)

$(VSIX):
	npm run compile
	npx vsce package

install: $(VSIX)
	code --install-extension $(VSIX)

push:
	git push origin main
