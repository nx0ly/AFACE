#!/usr/bin/env bun
/* PREGENERATED FILE - DO NOT MODIFY */

const DEFAULT_FILE = "gkAQUe0GyWZQ1dwZueaXzy"; // Macondo-Assets-Public

const token = process.env.FIGMA_TOKEN;

if (!token) {
    console.error(
        "FIGMA_TOKEN is not set.\n" +
            "Create a read-only personal access token in Figma → Settings → Security,\n" +
            "then: export FIGMA_TOKEN=figd_...",
    );
    process.exit(1);
}

const args = process.argv.slice(2);

function flag(name, fallback = null) {
    const index = args.indexOf("--" + name);
    return index === -1 ? fallback : (args[index + 1] ?? true);
}

const fileKey = flag("file", DEFAULT_FILE);
const scale = flag("scale", "4");
const format = flag("format", "png");

async function figma(path) {
    const response = await fetch("https://api.figma.com/v1" + path, {
        headers: { "X-Figma-Token": token },
    });

    if (!response.ok) {
        throw new Error(
            `Figma API ${response.status} ${response.statusText} for ${path}`,
        );
    }

    return response.json();
}

/** Walk the document tree and print every named, exportable-looking node. */
function walk(node, depth, rows) {
    const kind = node.type;

    // this file stores every asset as a placed RECTANGLE, so don't filter it out
    if (
        ["FRAME", "COMPONENT", "INSTANCE", "GROUP", "VECTOR", "RECTANGLE"].includes(
            kind,
        )
    ) {
        rows.push(`${"  ".repeat(depth)}${node.id.padEnd(12)} ${kind.padEnd(10)} ${node.name}`);
    }

    for (const child of node.children ?? []) {
        walk(child, depth + 1, rows);
    }
}

if (args.includes("--list")) {
    const data = await figma(`/files/${fileKey}?depth=4`);
    const rows = [];

    for (const page of data.document.children ?? []) {
        rows.push(`\n── page: ${page.name}`);
        for (const child of page.children ?? []) walk(child, 1, rows);
    }

    console.log(`File: ${data.name}`);
    console.log(rows.join("\n"));
    console.log("\nPick an id, then: bun run assets:figma -- --node <id> --out src/images/mango.png");
    process.exit(0);
}

const nodeId = flag("node");
const out = flag("out", "src/images/mango.png");

if (!nodeId) {
    console.error("Missing --node <id>. Run with --list to see what's in the file.");
    process.exit(1);
}

const render = await figma(
    `/images/${fileKey}?ids=${encodeURIComponent(nodeId)}&format=${format}&scale=${scale}`,
);

const url = render.images?.[nodeId];

if (!url) {
    console.error(`Figma returned no image for node ${nodeId}.`, render.err ?? "");
    process.exit(1);
}

const image = await fetch(url);

if (!image.ok) {
    console.error(`Could not download the render: ${image.status}`);
    process.exit(1);
}

await Bun.write(out, await image.arrayBuffer());

console.log(`Wrote ${out} (${format} @${scale}x) from node ${nodeId}.`);
