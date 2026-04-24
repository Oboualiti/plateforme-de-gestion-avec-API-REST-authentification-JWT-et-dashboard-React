import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth, isToday, addMonths } from "date-fns"
import { cn } from "../../lib/utils"
import { Button } from "./button"

export function Calendar({
  selected,
  onSelect,
  disabled = () => false,
  numberOfMonths = 1,
  className,
  classNames = {},
  isReadOnly = false,
}) {
  const [currentMonth, setCurrentMonth] = React.useState(new Date(selected || new Date()))

  const handlePrev = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const handleNext = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  return (
    <div className={cn("p-2", className, classNames.root)}>
      <div className={cn("space-y-2", classNames.container)}>
        <div className={cn("flex items-center justify-between", classNames.nav)}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={isReadOnly}
            className={cn("h-7 w-7 rounded-md p-0 hover:bg-muted/60", classNames.nav_button)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNext}
            disabled={isReadOnly}
            className={cn("h-7 w-7 rounded-md p-0 hover:bg-muted/60", classNames.nav_button)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className={cn("grid gap-3", numberOfMonths > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1", classNames.months)}>
          {Array.from({ length: numberOfMonths }).map((_, monthOffset) => {
            const monthDate = addMonths(currentMonth, monthOffset)
            const start = startOfMonth(monthDate)
            const end = endOfMonth(monthDate)
            const days = eachDayOfInterval({ start, end })
            const paddingStart = start.getDay()
            const allDays = [...Array(paddingStart).fill(null), ...days]

            return (
              <div key={format(monthDate, "yyyy-MM")} className={cn("min-w-[248px] space-y-2 rounded-lg bg-card/40 p-2", classNames.month)}>
                <h2 className={cn("px-1 text-sm font-extrabold text-foreground", classNames.caption_label)}>
                  {format(monthDate, "MMMM yyyy")}
                </h2>

                <div className={cn("grid grid-cols-7 gap-1 px-0.5", classNames.weekdays)}>
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                    <div key={`${monthOffset}-${day}`} className={cn("py-1 text-center text-xs font-medium tracking-normal text-muted-foreground", classNames.weekday)}>
                      {day}
                    </div>
                  ))}
                </div>

                <div className={cn("grid grid-cols-7 gap-1", classNames.month_grid)}>
                  {allDays.map((day, idx) => {
                    if (!day) {
                      return <div key={`empty-${monthOffset}-${idx}`} className="h-9 w-9" />
                    }

                    const isDisabled = isReadOnly || disabled(day)
                    const isSelected = selected && format(day, "yyyy-MM-dd") === format(selected, "yyyy-MM-dd")
                    const isCurrentMonth = isSameMonth(day, monthDate)
                    const isTodayDate = isToday(day)

                    return (
                      <button
                        key={format(day, "yyyy-MM-dd")}
                        onClick={() => !isDisabled && onSelect(day)}
                        disabled={isDisabled}
                        className={cn(
                          "h-8 w-8 rounded-md text-sm font-semibold transition-colors",
                          !isCurrentMonth && "text-muted-foreground/50",
                          isDisabled && "cursor-not-allowed opacity-40",
                          isSelected && "bg-foreground text-background",
                          !isSelected && !isDisabled && "hover:bg-muted/70",
                          isTodayDate && !isSelected && "ring-1 ring-primary/70",
                          classNames.day_button
                        )}
                      >
                        {format(day, "d")}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

Calendar.displayName = "Calendar"

