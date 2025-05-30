import { ChangeEventHandler, useState } from "react";
import { DayPicker, DayPickerProps, getDefaultClassNames, UI } from "react-day-picker";
import { faCalendar } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PopoverContentProps, PopoverProps } from "@radix-ui/react-popover";
import { format, setHours, setMinutes } from "date-fns";
import { twMerge } from "tailwind-merge";

import { Button } from "../Button";
import { Input } from "../Input";
import { Popover, PopoverContent, PopoverTrigger } from "../Popoverv2";

const defaultClassNames = getDefaultClassNames();

export type DatePickerProps = Omit<DayPickerProps, "selected"> & {
  value?: Date;
  onChange: (date?: Date) => void;
  popUpProps: PopoverProps;
  popUpContentProps: PopoverContentProps;
  dateFormat?: "PPP" | "PP" | "P"; // extend as needed
};

// Doc: https://react-day-picker.js.org/
export const DatePicker = ({
  value,
  onChange,
  popUpProps,
  popUpContentProps,
  dateFormat = "PPP",
  ...props
}: DatePickerProps) => {
  const [timeValue, setTimeValue] = useState<string>(value ? format(value, "HH:mm") : "00:00");

  const handleTimeChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const time = e.target.value;
    if (time) {
      setTimeValue(time);
      if (value) {
        const [hours, minutes] = time.split(":").map((str) => parseInt(str, 10));
        const newSelectedDate = setHours(setMinutes(value, minutes), hours);
        onChange(newSelectedDate);
      }
    }
  };

  const handleDaySelect = (date: Date | undefined) => {
    if (!timeValue || !date) {
      onChange(date);
      return;
    }

    const [hours, minutes] = timeValue.split(":").map((str) => parseInt(str, 10));
    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
    onChange(newDate);
  };

  return (
    <Popover {...popUpProps}>
      <PopoverTrigger asChild>
        <Button variant="outline_bg" leftIcon={<FontAwesomeIcon icon={faCalendar} />}>
          {value ? format(value, dateFormat) : "Pick a date and time"}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        {...popUpContentProps}
        className={twMerge(
          "w-fit border border-mineshaft-600 bg-mineshaft-800 p-2 font-inter",
          popUpContentProps.className
        )}
      >
        <div className="px-2 pt-4">
          <DayPicker
            {...props}
            mode="single"
            selected={value}
            onSelect={handleDaySelect}
            className="font-inter text-mineshaft-200"
            classNames={{
              today: "text-primary border-primary",
              selected: " text-mineshaft-100 bg-mineshaft-500",
              root: `text-mineshaft-300  ${defaultClassNames}`,
              [UI.DayButton]: "p-3 rounded hover:text-mineshaft-100",
              [UI.Weekday]: "px-3 pt-3",
              [UI.Chevron]: "fill-mineshaft-300"
            }}
          />
        </div>
        <div className="mx-4 my-4">
          <Input
            type="time"
            value={timeValue}
            onChange={handleTimeChange}
            className="bg-mineshaft-700 text-white [color-scheme:dark]"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
