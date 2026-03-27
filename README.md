# Pokemon Card Centering Tool

A browser-based tool for measuring the centering of Pokémon (and other trading) cards. Import a card photo, align 8 border measurement lines, and get precise left/right and top/bottom centering ratios.

## How It Works

The tool uses 8 draggable lines arranged in 4 pairs to measure card border thickness:

- **Left border**: Outer Left + Inner Left lines (cyan, vertical)
- **Right border**: Inner Right + Outer Right lines (cyan, vertical)
- **Top border**: Outer Top + Inner Top lines (orange, horizontal)
- **Bottom border**: Inner Bottom + Outer Bottom lines (orange, horizontal)

Centering is calculated as the ratio of opposite border thicknesses. A perfectly centered card reads **50.0 : 50.0**.

## Usage

1. **Import an image**: Paste from clipboard (Ctrl+V), drag-and-drop, or click "Choose File"
2. **Zoom in** on a border edge using the scroll wheel (supports up to 50x zoom)
3. **Drag each line** to precisely match the card's outer edge and inner artwork edge
4. **Rotate** the image with the bottom slider if the photo is slightly tilted
5. **Read the ratios** in the right panel — they update live as you adjust lines

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1`–`8` | Select a line for arrow-key nudging |
| Arrow keys | Nudge selected line by 1 image pixel |
| Shift + Arrow | Nudge selected line by 0.1 image pixel |
| `F` | Fit/reset zoom |
| `R` | Reset rotation to 0° |

### Line numbering

1. Outer Left
2. Inner Left
3. Inner Right
4. Outer Right
5. Outer Top
6. Inner Top
7. Inner Bottom
8. Outer Bottom

## Deployment

Static site — just serve the files. Works directly on GitHub Pages, Netlify, or any static host. No build step or dependencies required.

## Line Colors

- **Cyan**: Vertical lines (left/right borders). Outer = dashed, Inner = solid.
- **Orange**: Horizontal lines (top/bottom borders). Outer = dashed, Inner = solid.
