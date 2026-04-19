import { useEffect, useRef, useState } from "react";

import { useClickOutside } from "@/hooks/useClickOutside";
import { FormField, FormInput } from "@/shared/components/FormControls";

import { TIME_OPTIONS, formatMinutesToString, parseTimeString } from "../utils/dateHelpers";

interface TimeInputProps {
  earliest?: number;
  label: string;
  onChange: (minutes: number) => void;
  value: number;
}

export function TimeInput({ label, value, onChange, earliest }: TimeInputProps) {
  const [textValue, setTextValue] = useState(() => formatMinutesToString(value));
  const [open, setOpen] = useState(false);
  const [textError, setTextError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTextValue(formatMinutesToString(value));
  }, [value]);

  useClickOutside(
    containerRef,
    () => {
      setOpen(false);
    },
    open,
  );

  const applyValue = (minutes: number) => {
    const effective = earliest !== undefined ? Math.max(minutes, earliest) : minutes;
    onChange(effective);
    setTextValue(formatMinutesToString(effective));
    setTextError(false);
    setOpen(false);
  };

  const handleTextChange = (raw: string) => {
    setTextValue(raw);
    const parsed = parseTimeString(raw);
    setTextError(parsed === null || (earliest !== undefined && parsed < earliest));
  };

  const handleTextBlur = () => {
    const parsed = parseTimeString(textValue);
    if (parsed !== null && (earliest === undefined || parsed >= earliest)) {
      applyValue(parsed);
      return;
    }

    setTextValue(formatMinutesToString(value));
    setTextError(false);
  };

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      inputRef.current?.blur();
    }
    if (event.key === "Escape") {
      setTextValue(formatMinutesToString(value));
      setTextError(false);
      setOpen(false);
    }
  };

  const options =
    earliest !== undefined ? TIME_OPTIONS.filter((option) => option.value >= earliest) : TIME_OPTIONS;

  return (
    <FormField label={label}>
      <div ref={containerRef} style={{ position: "relative" }}>
        <FormInput
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={textValue}
          onChange={(event) => handleTextChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          placeholder="HH:MM"
          maxLength={5}
          style={{
            border: `1px solid ${textError ? "var(--color-danger)" : "var(--color-border)"}`,
            outline: "none",
            padding: "0.625rem",
          }}
        />
        {open ? (
          <ul className="time-dropdown">
            {options.map((option) => (
              <li
                key={option.value}
                className="time-dropdown-item"
                onMouseDown={() => applyValue(option.value)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FormField>
  );
}
