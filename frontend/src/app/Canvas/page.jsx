'use client';
import { Button } from '@/components/ui/button';
import { EraserIcon, LucideChevronDownCircle, LucideChevronFirst, LucideCircleChevronDown, LucideRemoveFormatting, PaintBucket, Pencil, PencilIcon, Redo, RemoveFormatting, RemoveFormattingIcon, RotateCcw, Undo, XCircle } from 'lucide-react';
import React, { useState, useRef } from 'react'
import { ReactSketchCanvas } from 'react-sketch-canvas'

const Sketch = () => {
  const canvasRef = useRef(null);

  const eraserCursor = `url("data:image/svg+xml,%3Csvg height='32px' width='32px' version='1.1' id='Layer_1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cg%3E%3Cg%3E%3Cpath d='M509.607,173.926L338.073,2.393C336.542,0.861,334.463,0,332.297,0s-4.245,0.861-5.777,2.393L87.126,241.787 c-3.191,3.191-3.191,8.364,0,11.554l1.926,1.926L2.393,341.926c-3.191,3.191-3.191,8.364,0,11.554l156.127,156.127 c1.595,1.595,3.686,2.393,5.777,2.393c2.09,0,4.182-0.797,5.777-2.393l86.659-86.659l1.926,1.926 c1.595,1.595,3.686,2.393,5.777,2.393c2.09,0,4.182-0.797,5.777-2.393L509.607,185.48c1.533-1.532,2.393-3.61,2.393-5.777 S511.139,175.458,509.607,173.926z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") 0 32, auto`;
  const pencilCursor = `url("data:image/svg+xml,%3Csvg fill='%23000000' height='32px' width='32px' version='1.1' id='Layer_1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Cg%3E%3Cg%3E%3Cpath d='M509.607,2.394c-2.332-2.332-5.837-3.034-8.888-1.778l-130.88,53.893c-0.271,0.109-0.537,0.233-0.799,0.371 c-0.251,0.136-0.472,0.267-0.687,0.411c-0.05,0.034-0.097,0.073-0.147,0.108c-0.169,0.118-0.338,0.237-0.499,0.369 c-0.21,0.172-0.413,0.354-0.605,0.547L56.315,367.103c-0.193,0.193-0.375,0.394-0.547,0.605c-0.141,0.171-0.267,0.35-0.392,0.529 c-0.027,0.039-0.059,0.076-0.085,0.115c-0.317,0.474-0.578,0.974-0.784,1.49L0.616,500.719c-1.256,3.049-0.554,6.556,1.778,8.888 C3.957,511.17,6.046,512,8.173,512c1.047,0,2.104-0.202,3.109-0.615l130.878-53.891c0.272-0.109,0.539-0.233,0.801-0.373 c0.243-0.131,0.468-0.265,0.686-0.411c0.048-0.032,0.093-0.07,0.139-0.102c0.171-0.12,0.342-0.24,0.505-0.375 c0.21-0.172,0.413-0.354,0.605-0.547l310.788-310.788c0.193-0.193,0.375-0.394,0.547-0.605c0.138-0.169,0.264-0.345,0.387-0.522 c0.03-0.042,0.064-0.082,0.091-0.124c0.317-0.475,0.578-0.974,0.785-1.491l53.89-130.875 C512.641,8.233,511.939,4.726,509.607,2.394z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E") 0 32, auto`;

  const styles = {
    border: '0.0625rem solid #9c9c9c',
    borderRadius: '0.25rem',
    cursor: pencilCursor
  };

  const eraserStyles = {
    ...styles,
    cursor: eraserCursor
  };
  
  const [strokeColor, setStrokeColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [isEraser, setIsEraser] = useState(false);
  const [isPencil, setIsPencil] = useState(true);
  const [paint, setPaint] = useState("#ffffff");

  function handleEraser() {
    setIsEraser(true);
    setIsPencil(false);
    canvasRef.current?.eraseMode(true);
  }

  function handlePencil() {
    setIsPencil(true);
    setIsEraser(false);
    canvasRef.current?.eraseMode(false);
  }
  function handleundo() {
    canvasRef.current?.undo(true);
  }
  function handleredo() {
    canvasRef.current?.redo(true);
  }
  function handleclear() {
    canvasRef.current?.clearCanvas(true);
  }
  
  return (
    <div className='h-screen flex justify-center items-center'>
      <ReactSketchCanvas
        ref={canvasRef}
        style={isEraser ? eraserStyles : styles}
        width="50%"
        height="430px"
        strokeWidth={strokeWidth}
        strokeColor={strokeColor}
        canvasColor={paint}
        eraserWidth={strokeWidth}
        className="border-9 border-purple-800 rounded-3xl"
      />
      <div className="flex flex-col gap-2 ml-4">
        <div className='flex gap-2'>

        <Button size="icon" style={{ backgroundColor: strokeColor }}>
          <input 
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              opacity: 0
            }}
            />
        </Button>
        <PencilIcon size='icon' height='30'/>
            </div>
        <div className='flex gap-2'>
        <Button size="icon" style={{ backgroundColor: paint, border: '0.0625rem solid #9c9c9c' }}>
          <input 
            type="color"
            value={paint}
            onChange={(e) => setPaint(e.target.value)}
            style={{
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              opacity: 0
            }}
            /> 
        </Button>
            <PaintBucket height='30' size='icon'/>
            </div>
        <input 
          type="number" 
          onChange={(e) => setStrokeWidth(Number(e.target.value))} 
          placeholder='enter strokeWidth'
          value={strokeWidth}
          min="1"
          max="50"
          className="p-2 border rounded w-14"
        />
        <Button
          size="icon"
          type="button"
          disabled={isEraser}
          onClick={handleEraser}
          cursor="pointer"
        >
          <EraserIcon/>
        </Button>
        <Button
          size="icon"
          type="button"
          disabled={isPencil}
          onClick={handlePencil}
        >
          <Pencil/>
        </Button>
        <div className='flex gap-2'>
          <Button onClick={handleundo} size="icon" type="button">
            <Undo/>
          </Button>
          <Button onClick={handleredo} size="icon" type="button">
            <Redo/>
          </Button>
        </div>
        <Button onClick={handleclear} size="icon" type="button">
        <RotateCcw/>
                </Button>
      </div>
    </div>
  );
}

export default Sketch;