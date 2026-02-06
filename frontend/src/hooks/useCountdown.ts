// useCountdown.ts - Hook for countdown to next DCA execution at 12:00 UTC
'use client';

import { useState, useEffect } from 'react';

interface TimeUntil {
  hours: number;
  minutes: number;
  seconds: number;
  formatted: string;
}

function calculateTimeUntil(): TimeUntil {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();

  // Target: 12:00 UTC
  let hoursUntil = 12 - utcHours;
  let minutesUntil = -utcMinutes;
  let secondsUntil = -utcSeconds;

  // Handle rollover
  if (secondsUntil < 0) {
    secondsUntil += 60;
    minutesUntil -= 1;
  }
  if (minutesUntil < 0) {
    minutesUntil += 60;
    hoursUntil -= 1;
  }
  if (hoursUntil < 0) {
    hoursUntil += 24;
  }

  // If it's exactly 12:00:00, show 24:00:00
  if (hoursUntil === 0 && minutesUntil === 0 && secondsUntil === 0) {
    hoursUntil = 24;
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatted = `${pad(hoursUntil)}:${pad(minutesUntil)}:${pad(secondsUntil)}`;

  return {
    hours: hoursUntil,
    minutes: minutesUntil,
    seconds: secondsUntil,
    formatted,
  };
}

export function useCountdown() {
  const [timeUntil, setTimeUntil] = useState<TimeUntil>(() => calculateTimeUntil());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeUntil(calculateTimeUntil());

    const interval = setInterval(() => {
      setTimeUntil(calculateTimeUntil());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return { ...timeUntil, mounted };
}
