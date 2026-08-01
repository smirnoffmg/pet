SHELL   := /bin/bash
SRC     := pet-pitch
LATEX   := xelatex
FLAGS   := -interaction=nonstopmode -halt-on-error

SHOTS_SRC := ../../screenshots
SHOT_SVG  := $(wildcard $(SHOTS_SRC)/*.svg)
SHOT_PDF  := $(patsubst $(SHOTS_SRC)/%.svg,img/shots/%.pdf,$(SHOT_SVG))

.PHONY: all clean shots

all: $(SRC).pdf

# Screenshots are committed as SVG — reviewable in a diff, a few hundred bytes
# each. beamer needs PDF, so they are converted at build time rather than stored
# twice. Regenerate the SVGs with `npm run screenshots` from the repo root.
shots: $(SHOT_PDF)

img/shots/%.pdf: $(SHOTS_SRC)/%.svg
	@mkdir -p img/shots
	rsvg-convert -f pdf -o $@ $<

$(SRC).pdf: $(SRC).tex $(SHOT_PDF) $(wildcard img/*.png)
	$(LATEX) $(FLAGS) $(SRC).tex
	$(LATEX) $(FLAGS) $(SRC).tex

clean:
	rm -f $(SRC).pdf $(SRC).aux $(SRC).log $(SRC).nav \
	       $(SRC).out $(SRC).snm $(SRC).toc $(SRC).vrb
	rm -rf img/shots
