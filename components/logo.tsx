import React from 'react';

export const Logo = (props: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div {...props} className={`font-mono font-bold text-xl tracking-tighter ${props.className}`}>
      LATCH
    </div>
  );
};
