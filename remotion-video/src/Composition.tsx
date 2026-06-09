import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import React from 'react';

export const Main: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoOpacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const logoScale = spring({
    frame,
    fps,
    config: {
      damping: 12,
    },
  });

  const text1Opacity = interpolate(frame, [40, 60], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const text2Opacity = interpolate(frame, [80, 100], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const text3Opacity = interpolate(frame, [120, 140], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const finalOpacity = interpolate(frame, [180, 210], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#020617',
        color: 'white',
        fontFamily: 'sans-serif',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Background Glow */}
      <div
        style={{
          position: 'absolute',
          width: '800px',
          height: '800px',
          background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, rgba(0,0,0,0) 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Logo Placeholder */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `scale(${logoScale})`,
          fontSize: '120px',
          fontWeight: 'bold',
          marginBottom: '40px',
          background: 'linear-gradient(to right, #3b82f6, #9333ea)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        StoreHub
      </div>

      {/* Rotating Values */}
      <div style={{ height: '80px', position: 'relative', width: '100%', textAlign: 'center' }}>
        <div style={{ opacity: text1Opacity - text2Opacity, position: 'absolute', width: '100%', fontSize: '60px', fontWeight: 300 }}>
          Inventory Management
        </div>
        <div style={{ opacity: text2Opacity - text3Opacity, position: 'absolute', width: '100%', fontSize: '60px', fontWeight: 300 }}>
          Event Logistics
        </div>
        <div style={{ opacity: text3Opacity - finalOpacity, position: 'absolute', width: '100%', fontSize: '60px', fontWeight: 300 }}>
          Sponsorship Opportunities
        </div>
      </div>

      {/* Final Call to Action */}
      <div
        style={{
          opacity: finalOpacity,
          position: 'absolute',
          bottom: '150px',
          fontSize: '40px',
          letterSpacing: '4px',
          textTransform: 'uppercase',
          color: '#94a3b8',
        }}
      >
        Powering the Future of Events
      </div>
    </AbsoluteFill>
  );
};
