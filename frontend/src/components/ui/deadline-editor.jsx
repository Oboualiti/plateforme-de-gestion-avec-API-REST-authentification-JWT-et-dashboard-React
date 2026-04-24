import * as React from "react"
import { useState } from "react"
import { Calendar as CalendarIcon } from "lucide-react"
import { DeadlinePlanner } from "./deadline-planner"
import { Button } from "./button"

export function DeadlineEditor({ 
  value, 
  onChange, 
  disabled = false,
  showLabel = true,
  label = "Deadline"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedDate = value ? new Date(value) : undefined

  const handleDateSelect = (date) => {
    if (date) {
      const formattedDate = date.toISOString().split('T')[0]
      onChange(formattedDate)
      setIsOpen(false)
    }
  }

  const handleClear = () => {
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-2">
      {showLabel && (
        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </label>
      )}
      
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <CalendarIcon className="h-4 w-4" />
          {selectedDate ? selectedDate.toLocaleDateString() : 'Select date'}
        </Button>
        
        {selectedDate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
          >
            Clear
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="flex justify-center border-t border-border pt-4">
          <DeadlinePlanner
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
          />
        </div>
      )}
    </div>
  )
}
