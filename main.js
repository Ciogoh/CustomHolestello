import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

// Configuration
const BOX_WIDTH = 20.0;
const BOX_DEPTH = 20.0;
const HEIGHT_PER_HOLE = 20.0;
const FIRST_HOLE_OFFSET = 10.0;
const HOLE_STEP = 20.0;
const BATCH_SPACING = 40.0; // Distance between blocks in batch mode

let scene, camera, renderer, controls;
let currentMeshes = []; // Array to hold multiple meshes
let debounceTimer; // Global timeout for debounce

// Params
let mode = 'single'; // 'single' or 'batch'
let numHoles = 5;
let batchList = [3, 2, 5];
let drillRadius = 4.0;
let grooveDepth = 0.5;

// UI Elements
const modeRadios = document.getElementsByName('mode');
const singleControls = document.getElementById('single-controls');
const batchControls = document.getElementById('batch-controls');
const holesInput = document.getElementById('holes-input');
const holesValDisplay = document.getElementById('holes-val');
const batchInput = document.getElementById('batch-input');
const radiusInput = document.getElementById('radius-input');
const depthInput = document.getElementById('depth-input');
const heightDisplay = document.getElementById('height-display');
const downloadObjBtn = document.getElementById('download-obj-btn');
const downloadRhinoBtn = document.getElementById('download-rhino-btn');

init();
debouncedGenerate();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
    camera.position.set(80, 60, 80);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.0;

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0);
    mainLight.position.set(50, 100, 70);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-50, 20, -50);
    scene.add(fillLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    scene.add(new THREE.GridHelper(500, 50, 0x444444, 0x333333));
    scene.add(new THREE.AxesHelper(30));

    // UI Init
    updateModeUI();

    window.addEventListener('resize', onWindowResize);

    // Listeners
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            mode = e.target.value;
            updateModeUI();
            debouncedGenerate();
        });
    });

    holesInput.addEventListener('input', (e) => {
        let val = parseInt(e.target.value);
        if (val < 1) val = 1;
        numHoles = val;
        holesValDisplay.textContent = numHoles;
        updateHeightDisplay();
        debouncedGenerate();
    });

    batchInput.addEventListener('input', (e) => {
        // Parse "1, 2, 3"
        const str = e.target.value;
        const parts = str.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (parts.length > 0) batchList = parts;
        updateHeightDisplay();
        debouncedGenerate();
    });

    radiusInput.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        if (val <= 0) val = 0.5;
        drillRadius = val;
        debouncedGenerate();
    });

    depthInput.addEventListener('input', (e) => {
        let val = parseFloat(e.target.value);
        grooveDepth = val;
        debouncedGenerate();
    });

    if (downloadObjBtn) downloadObjBtn.addEventListener('click', downloadOBJ);
    if (downloadRhinoBtn) downloadRhinoBtn.addEventListener('click', downloadRhinoScript);
}

function updateModeUI() {
    if (mode === 'single') {
        singleControls.style.display = 'block';
        batchControls.style.display = 'none';
    } else {
        singleControls.style.display = 'none';
        batchControls.style.display = 'block';
    }
    updateHeightDisplay();
}

function updateHeightDisplay() {
    if (mode === 'single') {
        const h = numHoles * HEIGHT_PER_HOLE;
        heightDisplay.textContent = h;
    } else {
        // Show range or total length? Just show "Variable"
        heightDisplay.textContent = "Variable";
    }
}



function debouncedGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        generateModel();
    }, 300);
}

function generateModel() {
    // Clear old meshes
    currentMeshes.forEach(mesh => {
        scene.remove(mesh);
        // clean up
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
    });
    currentMeshes = [];

    // Determine what to generate
    let blocksToMake = [];
    if (mode === 'single') {
        blocksToMake = [numHoles];
    } else {
        blocksToMake = batchList;
    }

    // Generate each block
    // We position them along X axis: 0, 40, 80...

    // OPTIMIZATION: Use fewer segments for preview
    const SEGMENTS = 16;

    const hCylGeo = new THREE.CylinderGeometry(drillRadius, drillRadius, 80.0, SEGMENTS);
    const boxBaseGeo = new THREE.BoxGeometry(BOX_WIDTH, 1, BOX_DEPTH); // Helper for resize

    // Cutter Geometries reused?
    // CSG Evaluator needs fresh brushes usually or we simple clone.

    const evaluator = new Evaluator();
    const material = new THREE.MeshStandardMaterial({
        color: 0xeeeeee, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide
    });

    blocksToMake.forEach((holes, index) => {
        const boxHeight = holes * HEIGHT_PER_HOLE;

        // Brush 1: Box
        const boxGeo = new THREE.BoxGeometry(BOX_WIDTH, boxHeight, BOX_DEPTH);
        const boxBrush = new Brush(boxGeo);
        // Position X based on index
        const xOffset = index * BATCH_SPACING;
        boxBrush.position.set(xOffset, 0, 0);
        boxBrush.updateMatrixWorld();

        // Prepare cutters
        // We need to apply the SAME transform (xOffset) to cutters relative to box center?
        // Easier: Build the block at (0,0,0) then Move the Geometry? 
        // Or just move brushes.

        let resultBrush = boxBrush;

        // 1. Vertical Hole
        const vCylGeo = new THREE.CylinderGeometry(drillRadius, drillRadius, boxHeight + 20.0, SEGMENTS);
        const vCylBrush = new Brush(vCylGeo);
        vCylBrush.position.set(xOffset, 0, 0); // Offset X
        vCylBrush.updateMatrixWorld();
        resultBrush = evaluator.evaluate(resultBrush, vCylBrush, SUBTRACTION);

        // Offsets
        const sideGrooveOffset = (BOX_WIDTH / 2) - grooveDepth + drillRadius;
        const topBottomGrooveOffset = (boxHeight / 2) - grooveDepth + drillRadius;

        // Loop Holes
        for (let i = 0; i < holes; i++) {
            const yPos = (-boxHeight / 2) + FIRST_HOLE_OFFSET + (i * HOLE_STEP);

            // X-Axis Hole (Corrected Global Pos: xOffset, yPos, 0)
            const xBrush = new Brush(hCylGeo);
            xBrush.rotation.set(0, 0, Math.PI / 2);
            xBrush.position.set(xOffset, yPos, 0);
            xBrush.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, xBrush, SUBTRACTION);

            // Z-Axis Hole
            const zBrush = new Brush(hCylGeo);
            zBrush.rotation.set(Math.PI / 2, 0, 0);
            zBrush.position.set(xOffset, yPos, 0);
            zBrush.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, zBrush, SUBTRACTION);

            if (grooveDepth > 0) {
                // Front (+Z)
                const fG = new Brush(hCylGeo);
                fG.rotation.set(0, 0, Math.PI / 2);
                fG.position.set(xOffset, yPos, sideGrooveOffset);
                fG.updateMatrixWorld();
                resultBrush = evaluator.evaluate(resultBrush, fG, SUBTRACTION);

                // Back (-Z)
                const bG = new Brush(hCylGeo);
                bG.rotation.set(0, 0, Math.PI / 2);
                bG.position.set(xOffset, yPos, -sideGrooveOffset);
                bG.updateMatrixWorld();
                resultBrush = evaluator.evaluate(resultBrush, bG, SUBTRACTION);

                // Right (+X relative to box center) -> Box Center X is xOffset. Right is xOffset + Offset
                const rG = new Brush(hCylGeo);
                rG.rotation.set(Math.PI / 2, 0, 0);
                rG.position.set(xOffset + sideGrooveOffset, yPos, 0);
                rG.updateMatrixWorld();
                resultBrush = evaluator.evaluate(resultBrush, rG, SUBTRACTION);

                // Left (-X)
                const lG = new Brush(hCylGeo);
                lG.rotation.set(Math.PI / 2, 0, 0);
                lG.position.set(xOffset - sideGrooveOffset, yPos, 0);
                lG.updateMatrixWorld();
                resultBrush = evaluator.evaluate(resultBrush, lG, SUBTRACTION);
            }
        }

        // Top/Bottom Grooves
        if (grooveDepth > 0) {
            const topX = new Brush(hCylGeo);
            topX.rotation.set(0, 0, Math.PI / 2);
            topX.position.set(xOffset, topBottomGrooveOffset, 0);
            topX.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, topX, SUBTRACTION);

            const topZ = new Brush(hCylGeo);
            topZ.rotation.set(Math.PI / 2, 0, 0);
            topZ.position.set(xOffset, topBottomGrooveOffset, 0);
            topZ.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, topZ, SUBTRACTION);

            const botX = new Brush(hCylGeo);
            botX.rotation.set(0, 0, Math.PI / 2);
            botX.position.set(xOffset, -topBottomGrooveOffset, 0);
            botX.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, botX, SUBTRACTION);

            const botZ = new Brush(hCylGeo);
            botZ.rotation.set(Math.PI / 2, 0, 0);
            botZ.position.set(xOffset, -topBottomGrooveOffset, 0);
            botZ.updateMatrixWorld();
            resultBrush = evaluator.evaluate(resultBrush, botZ, SUBTRACTION);
        }

        const mesh = new THREE.Mesh(resultBrush.geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        currentMeshes.push(mesh);
    });
}

function downloadOBJ() {
    const exporter = new OBJExporter();
    // Export scene containing all meshes? Or specific group.
    // exporter.parse(scene) exports everything.
    // Let's create a temporary group.
    const group = new THREE.Group();
    currentMeshes.forEach(m => group.add(m.clone()));

    const result = exporter.parse(group);
    const blob = new Blob([result], { type: 'text/plain' });
    downloadFile(blob, `batch_blocks.obj`);
}

function downloadRhinoScript() {
    // Prepare list
    let blocks = (mode === 'single') ? [numHoles] : batchList;

    // Python script
    // We define a function create_block(num, x_offset)
    let script = `import rhinoscriptsyntax as rs

def create_block(num_holes, x_offset):
    width = ${BOX_WIDTH}
    depth = ${BOX_DEPTH}
    height = num_holes * ${HEIGHT_PER_HOLE}
    
    # Base Box
    # Center X at x_offset
    cx = x_offset
    cy = 0
    cz = 0
    
    c1 = [cx-width/2, cy-depth/2, cz-height/2]
    c2 = [cx+width/2, cy-depth/2, cz-height/2]
    c3 = [cx+width/2, cy+depth/2, cz-height/2]
    c4 = [cx-width/2, cy+depth/2, cz-height/2]
    c5 = [cx-width/2, cy-depth/2, cz+height/2]
    c6 = [cx+width/2, cy-depth/2, cz+height/2]
    c7 = [cx+width/2, cy+depth/2, cz+height/2]
    c8 = [cx-width/2, cy+depth/2, cz+height/2]
    
    base_id = rs.AddBox([c1, c2, c3, c4, c5, c6, c7, c8])
    
    cutters = []
    radius = ${drillRadius}
    
    # Vertical Hole
    base_pt = [cx, 0, -height/2 - 50.0]
    plane = rs.PlaneFromNormal(base_pt, [0,0,1])
    cyl_v = rs.AddCylinder(plane, height + 100.0, radius)
    cutters.append(cyl_v)
    
    steps = num_holes
    offset = ${FIRST_HOLE_OFFSET}
    step_size = ${HOLE_STEP}
    
    groove_offset = ${(BOX_WIDTH / 2) - grooveDepth + drillRadius}
    cross_length = 80.0
    
    for i in range(steps):
        z_pos = (-height / 2) + offset + (i * step_size)
        
        # Internal Holes
        start_x = [cx-40.0, 0, z_pos]
        plane_x = rs.PlaneFromNormal(start_x, [1,0,0])
        cutters.append(rs.AddCylinder(plane_x, cross_length, radius))
        
        start_y = [cx, -40.0, z_pos]
        plane_y = rs.PlaneFromNormal(start_y, [0,1,0])
        cutters.append(rs.AddCylinder(plane_y, cross_length, radius))
        
        if ${grooveDepth} > 0:
            # G1 (+Y relative -> Front)
            start_g1 = [cx-40.0, groove_offset, z_pos]
            plane_g1 = rs.PlaneFromNormal(start_g1, [1,0,0])
            cutters.append(rs.AddCylinder(plane_g1, cross_length, radius))
            # G2
            start_g2 = [cx-40.0, -groove_offset, z_pos]
            plane_g2 = rs.PlaneFromNormal(start_g2, [1,0,0])
            cutters.append(rs.AddCylinder(plane_g2, cross_length, radius))
            # G3 (+X relative -> Right)
            # Center X of cutter is cx + groove_offset
            start_g3 = [cx+groove_offset, -40.0, z_pos]
            plane_g3 = rs.PlaneFromNormal(start_g3, [0,1,0])
            cutters.append(rs.AddCylinder(plane_g3, cross_length, radius))
            # G4
            start_g4 = [cx-groove_offset, -40.0, z_pos]
            plane_g4 = rs.PlaneFromNormal(start_g4, [0,1,0])
            cutters.append(rs.AddCylinder(plane_g4, cross_length, radius))

    # Top/Bottom Grooves
    if ${grooveDepth} > 0:
        tb_offset = (height / 2) - ${grooveDepth} + ${drillRadius}
        
        # Top
        start_tx = [cx-40.0, 0, tb_offset]
        plane_tx = rs.PlaneFromNormal(start_tx, [1,0,0])
        cutters.append(rs.AddCylinder(plane_tx, cross_length, radius))
        
        start_ty = [cx, -40.0, tb_offset]
        plane_ty = rs.PlaneFromNormal(start_ty, [0,1,0])
        cutters.append(rs.AddCylinder(plane_ty, cross_length, radius))

        # Bottom
        start_bx = [cx-40.0, 0, -tb_offset]
        plane_bx = rs.PlaneFromNormal(start_bx, [1,0,0])
        cutters.append(rs.AddCylinder(plane_bx, cross_length, radius))
        
        start_by = [cx, -40.0, -tb_offset]
        plane_by = rs.PlaneFromNormal(start_by, [0,1,0])
        cutters.append(rs.AddCylinder(plane_by, cross_length, radius))

    rs.BooleanDifference(base_id, cutters)


def main():
    rs.UnitSystem(2)
    rs.EnableRedraw(False)
    
    blocks = [${blocks.join(',')}]
    spacing = ${BATCH_SPACING}
    
    for i, h in enumerate(blocks):
        x_pos = i * spacing
        create_block(h, x_pos)
        
    rs.EnableRedraw(True)
    print("Batch Generated")

if __name__ == "__main__":
    main()
`;

    const blob = new Blob([script], { type: 'text/plain' });
    downloadFile(blob, `batch_blocks_v5.py`);
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }, 100);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
