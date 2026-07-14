package main

import (
	"encoding/binary"
	"math"
	"sync"
	"syscall/js"
)

// ── Point Cloud Parser ──────────────────────────────────────────────────────

func parsePointCloud(this js.Value, args []js.Value) interface{} {
	fileBuffer := args[0]

	length := fileBuffer.Get("byteLength").Int()
	buffer := make([]byte, length)
	js.CopyBytesToGo(buffer, fileBuffer)

	positions, colors := parsePointCloudData(buffer)

	result := js.Global().Get("Object").New()

	posArray := js.Global().Get("Float32Array").New(len(positions))
	for i, v := range positions {
		posArray.SetIndex(i, v)
	}
	result.Set("positions", posArray)

	if len(colors) > 0 {
		colorArray := js.Global().Get("Float32Array").New(len(colors))
		for i, v := range colors {
			colorArray.SetIndex(i, v)
		}
		result.Set("colors", colorArray)
	}

	return result
}

func parsePointCloudData(data []byte) ([]float32, []float32) {
	var positions []float32
	var colors []float32

	pointCount := len(data) / 12

	for i := 0; i < pointCount; i++ {
		offset := i * 12

		x := math.Float32frombits(binary.LittleEndian.Uint32(data[offset:]))
		y := math.Float32frombits(binary.LittleEndian.Uint32(data[offset+4:]))
		z := math.Float32frombits(binary.LittleEndian.Uint32(data[offset+8:]))

		positions = append(positions, x, y, z)
		colors = append(colors, 0.5, 0.5, 0.5)
	}

	return positions, colors
}

// ── CAD Importer ────────────────────────────────────────────────────────────

func importCAD(this js.Value, args []js.Value) interface{} {
	fileBuffer := args[0]

	length := fileBuffer.Get("byteLength").Int()
	buffer := make([]byte, length)
	js.CopyBytesToGo(buffer, fileBuffer)

	meshes := parseCADData(buffer)

	result := js.Global().Get("Object").New()
	meshesArray := js.Global().Get("Array").New(len(meshes))

	for i, mesh := range meshes {
		meshObj := js.Global().Get("Object").New()

		posArray := js.Global().Get("Float32Array").New(len(mesh.positions))
		for j, v := range mesh.positions {
			posArray.SetIndex(j, v)
		}
		meshObj.Set("positions", posArray)

		idxArray := js.Global().Get("Uint32Array").New(len(mesh.indices))
		for j, v := range mesh.indices {
			idxArray.SetIndex(j, v)
		}
		meshObj.Set("indices", idxArray)

		meshesArray.SetIndex(i, meshObj)
	}

	result.Set("meshes", meshesArray)

	return result
}

type CADMesh struct {
	positions []float32
	indices   []uint32
}

func parseCADData(data []byte) []CADMesh {
	var meshes []CADMesh

	positions := []float32{
		-0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
		-0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
	}

	indices := []uint32{
		0, 1, 2, 2, 3, 0,
		4, 5, 6, 6, 7, 4,
		0, 1, 5, 5, 4, 0,
		2, 3, 7, 7, 6, 2,
		0, 3, 7, 7, 4, 0,
		1, 2, 6, 6, 5, 1,
	}

	meshes = append(meshes, CADMesh{
		positions: positions,
		indices:   indices,
	})

	return meshes
}

// ── Concurrent Worker Pool ──────────────────────────────────────────────────

type WorkerPool struct {
	workers chan struct{}
	wg      sync.WaitGroup
}

func NewWorkerPool(size int) *WorkerPool {
	return &WorkerPool{
		workers: make(chan struct{}, size),
	}
}

func (p *WorkerPool) Submit(task func()) {
	p.wg.Add(1)
	p.workers <- struct{}{}

	go func() {
		defer p.wg.Done()
		defer func() { <-p.workers }()
		task()
	}()
}

func (p *WorkerPool) Wait() {
	p.wg.Wait()
}

// ── Main Entry Point ────────────────────────────────────────────────────────

func main() {
	js.Global().Set("goParsePointCloud", js.FuncOf(parsePointCloud))
	js.Global().Set("goImportCAD", js.FuncOf(importCAD))

	select {}
}
