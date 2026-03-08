import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  label: string;
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

const DatePicker = ({ label, date, onDateChange }: DatePickerProps) => (
  <div className="flex items-center gap-2">
    <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{label}</span>
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 w-[150px] justify-start text-left text-xs font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {date ? format(date, "MMM d, yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  </div>
);

interface DateRangeFilterProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
}

export const DateRangeFilter = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: DateRangeFilterProps) => (
  <div className="flex flex-wrap items-center gap-3">
    <DatePicker label="From" date={startDate} onDateChange={onStartDateChange} />
    <DatePicker label="To" date={endDate} onDateChange={onEndDateChange} />
  </div>
);

interface AsOfDateFilterProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

export const AsOfDateFilter = ({ date, onDateChange }: AsOfDateFilterProps) => (
  <DatePicker label="As of" date={date} onDateChange={onDateChange} />
);
