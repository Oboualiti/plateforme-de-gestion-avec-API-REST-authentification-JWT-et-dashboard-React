"use client"

import * as React from "react"
import { Calendar } from "./calendar"
import { Card, CardContent } from "./card"

export function DeadlinePlanner({ 
  selectedDate, 
  onDateSelect, 
  minDate = new Date("1900-01-01"),
  numberOfMonths = 2,
  disabled = false,
}) {
  const maxDate = new Date()
  maxDate.setFullYear(maxDate.getFullYear() + 5)

  return (
    <Card className="mx-auto w-fit border border-border/60 bg-gradient-to-br from-surface-1 via-surface-1 to-surface-2 p-0 shadow-none">
      <CardContent className="overflow-x-auto p-1">
        <Calendar
          selected={selectedDate}
          onSelect={onDateSelect}
          numberOfMonths={numberOfMonths}
          isReadOnly={disabled}
          classNames={{
            day_button: "!rounded-full",
          }}
          disabled={(date) =>
            disabled || date > maxDate || date < minDate
          }
        />
      </CardContent>
    </Card>
  )
}
