import { startOfMonth, isSameDay } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn, formatDisplayDate } from "@/lib/utils";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemo } from "react";

interface DatePickerProps {
  label: string;
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

const DatePicker = ({ label, date, onDateChange }: DatePickerProps) => {
  const { defaultCurrency } = useTenant();
  return (
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
            {date ? formatDisplayDate(date, defaultCurrency) : "Pick a date"}
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
};

interface Preset {
  label: string;
  getRange: () => [Date, Date];
}

const getPresets = (): Preset[] => {
  const now = new Date();
  const year = now.getFullYear();
  return [
    { label: "This Month", getRange: () => [startOfMonth(now), now] },
    { label: "Q1", getRange: () => [new Date(year, 0, 1), new Date(year, 2, 31)] },
    { label: "Q2", getRange: () => [new Date(year, 0, 1), new Date(year, 5, 30)] },
    { label: "Q3", getRange: () => [new Date(year, 0, 1), new Date(year, 8, 30)] },
    { label: "YTD", getRange: () => [new Date(year, 0, 1), now] },
  ];
};

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
}: DateRangeFilterProps) => {
  const presets = useMemo(() => getPresets(), []);

  const activePreset = useMemo(() => {
    if (!startDate || !endDate) return null;
    return presets.find((p) => {
      const [s, e] = p.getRange();
      return isSameDay(startDate, s) && isSameDay(endDate, e);
    })?.label ?? null;
  }, [startDate, endDate, presets]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        {presets.map((p) => (
          <Button
            key={p.label}
            variant={activePreset === p.label ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => {
              const [s, e] = p.getRange();
              onStartDateChange(s);
              onEndDateChange(e);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <DatePicker label="From" date={startDate} onDateChange={onStartDateChange} />
      <DatePicker label="To" date={endDate} onDateChange={onEndDateChange} />
    </div>
  );
};

interface AsOfDateFilterProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

export const AsOfDateFilter = ({ date, onDateChange }: AsOfDateFilterProps) => (
  <DatePicker label="As of" date={date} onDateChange={onDateChange} />
);
