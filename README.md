# Holey Box Generator

A web-based tool to generate customizable 3D blocks with holes and grooves, designed for workflow integration with Rhino 3D.

**[🌐 Live Demo / Tool Link](https://ciogoh.github.io/CustomHolestello/)**

## Features

- **Dynamic Box Sizing**: Height automatically adjusts based on the number of holes.
- **Parametric Holes**: Customize drill radius and groove depth.
- **Batch Generation**: Generate a single block or multiple blocks in a row (e.g., "3, 2, 5 holes") in one go.
- **Rhino Export (.py)**: Exports a Python script that generates true NURBS solids in Rhino 3D.
- **Mesh Export (.obj)**: Exports a 3D mesh for quick previewing or other 3D software.
- **Real-time Preview**: 3D preview using Three.js and CSG (Constructive Solid Geometry).

## How to Use

1. **Open `index.html`** in a modern web browser (requires a local server or proper CORS handling for modules).
2. **Select Mode**:
   - **Single**: Generate one block.
   - **Batch**: Generate a series of blocks by entering comma-separated numbers (e.g., `5, 10, 3`).
3. **Adjust Parameters**:
   - **Drill Radius**: Size of the holes.
   - **Groove Depth**: Depth of the decorative grooves on all 6 faces.
4. **Download**:
   - Click **Download for Rhino** to get a `.py` script.
   - Run this script in Rhino using the `RunPythonScript` command.

## Tech Stack

- **Three.js**: 3D rendering.
- **three-bvh-csg**: Boolean operations for the web preview.
- **Vanilla JS/HTML/CSS**: No build step required (using ES modules via importmap).

## Installation

Simply clone this repository and serve the directory using a local web server:

```bash
# Python 3
python3 -m http.server
```

Then visit `http://localhost:8000` in your browser.
