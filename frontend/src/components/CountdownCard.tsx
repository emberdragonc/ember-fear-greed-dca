// CountdownCard.tsx - Shows countdown to next DCA execution at 12:00 UTC
'use client';

import { useState, useEffect, useMemo } from 'react';

interface TimeUntil {
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeUntilNextExecution(): TimeUntil {
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

  return {
    hours: hoursUntil,
    minutes: minutesUntil,
    seconds: secondsUntil,
  };
}

export function CountdownCard() {
  const [timeUntil, setTimeUntil] = useState<TimeUntil>({ hours: 0, minutes: 0, seconds: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTimeUntil(getTimeUntilNextExecution());

    const interval = setInterval(() => {
      setTimeUntil(getTimeUntilNextExecution());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatNumber = (n: number) => n.toString().padStart(2, '0');

  // Show loading state during SSR
  if (!mounted) {
    return (
      <div className="p-6 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">⏰</span>
          <h3 className="text-sm font-medium text-gray-400">Next DCA Execution</h3>
        </div>
        <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-2xl border border-blue-500/20 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
        </span>
        <h3 className="text-sm font-medium text-blue-300">Next DCA Execution</h3>
      </div>

      <p className="text-xs text-gray-500 mb-4">
        Transactions occur daily at <span className="text-blue-400 font-semibold">12:00 UTC</span>
      </p>

      {/* Countdown Timer */}
      <div className="flex items-center justify-center gap-2">
        {/* Hours */}
        <div className="flex flex-col items-center">
          <div className="bg-black/40 rounded-xl px-4 py-3 border border-white/10 min-w-[60px]">
            <span className="text-3xl font-bold text-white font-mono">
              {formatNumber(timeUntil.hours)}
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">Hours</span>
        </div>

        <span className="text-2xl text-blue-400 font-bold pb-5">:</span>

        {/* Minutes */}
        <div className="flex flex-col items-center">
          <div className="bg-black/40 rounded-xl px-4 py-3 border border-white/10 min-w-[60px]">
            <span className="text-3xl font-bold text-white font-mono">
              {formatNumber(timeUntil.minutes)}
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">Minutes</span>
        </div>

        <span className="text-2xl text-blue-400 font-bold pb-5">:</span>

        {/* Seconds */}
        <div className="flex flex-col items-center">
          <div className="bg-black/40 rounded-xl px-4 py-3 border border-white/10 min-w-[60px]">
            <span className="text-3xl font-bold text-blue-400 font-mono">
              {formatNumber(timeUntil.seconds)}
            </span>
          </div>
          <span className="text-xs text-gray-500 mt-1">Seconds</span>
        </div>
      </div>

      {/* Info badge */}
      <div className="mt-4 flex items-center justify-center">
        <span className="px-3 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
          ⚡ Based on Fear & Greed Index
        </span>
      </div>
    </div>
  );
}

export default CountdownCard;
