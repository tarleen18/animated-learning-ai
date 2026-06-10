import { useEffect, useMemo, useState } from 'react';

function getSceneType(description) {
  const lower = description.toLowerCase();
  if (lower.includes('question') || lower.includes('?')) return 'question';
  if (lower.includes('card') || lower.includes('cards')) return 'cards';
  if (lower.includes('arrow') || lower.includes('flow')) return 'arrows';
  if (lower.includes('zoom') || lower.includes('shape') || lower.includes('scene')) return 'shape';
  return 'pulse';
}

function SceneGraphic({ type }) {
  if (type === 'question') {
    return (
      <div className="graphic questionGraphic">
        <div className="questionCircle">?</div>
      </div>
    );
  }

  if (type === 'cards') {
    return (
      <div className="graphic cardsGraphic">
        <div className="card cardA">1</div>
        <div className="card cardB">2</div>
        <div className="card cardC">3</div>
      </div>
    );
  }

  if (type === 'arrows') {
    return (
      <div className="graphic arrowsGraphic">
        <div className="arrow arrowA">→</div>
        <div className="arrow arrowB">→</div>
        <div className="arrow arrowC">→</div>
      </div>
    );
  }

  return (
    <div className="graphic pulseGraphic">
      <div className="pulseCircle" />
      <div className="pulseCircle pulseCircle2" />
    </div>
  );
}

export default function ScenePreview({ storyboard }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const activeScene = storyboard?.[activeIndex];

  const totalDuration = useMemo(() => (
    storyboard?.reduce((sum, scene) => sum + (scene.duration || 0), 0) || 0
  ), [storyboard]);

  const elapsed = useMemo(() => (
    storyboard?.slice(0, activeIndex).reduce((sum, scene) => sum + (scene.duration || 0), 0) || 0
  ), [activeIndex, storyboard]);

  const progressPercent = totalDuration ? Math.round(((elapsed + (activeScene?.duration || 0)) / totalDuration) * 100) : 0;

  useEffect(() => {
    if (!storyboard?.length) return;
    setActiveIndex(0);
    setPlaying(true);
  }, [storyboard]);

  useEffect(() => {
    if (!playing || !storyboard?.length) return;
    const current = storyboard[activeIndex];
    const timeout = setTimeout(() => {
      if (activeIndex + 1 < storyboard.length) {
        setActiveIndex(activeIndex + 1);
      } else {
        setPlaying(false);
      }
    }, (current?.duration || 3) * 1000);
    return () => clearTimeout(timeout);
  }, [activeIndex, playing, storyboard]);

  if (!storyboard || storyboard.length === 0) {
    return null;
  }

  const sceneType = getSceneType(activeScene.visualDescription || activeScene.onScreenText || '');

  return (
    <div style={previewStyles.container}>
      <div style={previewStyles.header}>
        <div>
          <h3 style={previewStyles.previewTitle}>Animated Preview</h3>
          <p style={previewStyles.previewSubtitle}>Watch the storyboard animate scene-by-scene.</p>
        </div>
        <button style={previewStyles.playButton} onClick={() => { setActiveIndex(0); setPlaying(true); }}>
          Replay
        </button>
      </div>

      <div style={previewStyles.viewport}>
        <div style={previewStyles.sceneCard}>
          <div style={previewStyles.sceneLabel}>Scene {activeScene.number}</div>
          <SceneGraphic type={sceneType} />
          <div style={previewStyles.sceneText}>"{activeScene.onScreenText || activeScene.visualDescription}"</div>
        </div>
      </div>

      <div style={previewStyles.details}>
        <p style={previewStyles.narration}><strong>Narration:</strong> {activeScene.narration}</p>
        <p style={previewStyles.duration}><strong>Duration:</strong> {activeScene.duration}s</p>
      </div>

      <div style={previewStyles.progressBar}>
        <div style={{ ...previewStyles.progressValue, width: `${progressPercent}%` }} />
      </div>

      <style jsx>{`
        .graphic {
          position: relative;
          width: 100%;
          height: 220px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .questionGraphic .questionCircle {
          width: 120px;
          height: 120px;
          border-radius: 999px;
          background: linear-gradient(135deg, #2563eb, #8b5cf6);
          display: grid;
          place-items: center;
          color: white;
          font-size: 4rem;
          animation: pulseScale 2.5s ease-in-out infinite;
        }

        .cardsGraphic {
          gap: 16px;
        }

        .card {
          width: 100px;
          height: 140px;
          border-radius: 24px;
          background: white;
          border: 1px solid rgba(15, 23, 42, 0.12);
          box-shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
          display: grid;
          place-items: center;
          font-size: 1.25rem;
          color: #111827;
          animation: slideIn 1.6s ease forwards;
        }

        .cardA { animation-delay: 0.1s; }
        .cardB { animation-delay: 0.25s; }
        .cardC { animation-delay: 0.4s; }

        .arrowsGraphic {
          width: 100%;
          justify-content: space-around;
        }

        .arrow {
          font-size: 4rem;
          color: #2563eb;
          opacity: 0.8;
          animation: moveRight 2s ease-in-out infinite;
        }

        .arrowB { animation-delay: 0.2s; }
        .arrowC { animation-delay: 0.4s; }

        .pulseGraphic {
          width: 170px;
          height: 170px;
        }

        .pulseCircle {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          background: rgba(37, 99, 235, 0.2);
          animation: pulseRing 2s ease-out infinite;
        }

        .pulseCircle2 {
          animation-delay: 0.3s;
          background: rgba(139, 92, 246, 0.2);
          transform: scale(0.7);
        }

        @keyframes pulseScale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }

        @keyframes slideIn {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes moveRight {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(14px); }
        }

        @keyframes pulseRing {
          0% { transform: scale(0.65); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

const previewStyles = {
  container: {
    marginTop: '2rem',
    padding: '1.5rem',
    borderRadius: 24,
    background: '#f8fafc',
    border: '1px solid #e2e8f0'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
    alignItems: 'center'
  },
  previewTitle: {
    margin: 0,
    fontSize: '1.25rem'
  },
  previewSubtitle: {
    margin: '0.25rem 0 0',
    color: '#475569'
  },
  playButton: {
    padding: '0.75rem 1rem',
    borderRadius: 16,
    border: 'none',
    background: '#2563eb',
    color: 'white',
    cursor: 'pointer'
  },
  viewport: {
    marginTop: '1.5rem',
    padding: '1rem',
    borderRadius: 20,
    background: 'white',
    border: '1px solid #cbd5e1'
  },
  sceneCard: {
    textAlign: 'center',
    padding: '1rem'
  },
  sceneLabel: {
    marginBottom: '1rem',
    fontWeight: 700,
    color: '#1e293b'
  },
  sceneText: {
    marginTop: '1rem',
    color: '#475569',
    fontSize: '0.96rem'
  },
  details: {
    marginTop: '1rem',
    display: 'grid',
    gap: '0.5rem'
  },
  narration: {
    margin: 0,
    color: '#334155'
  },
  duration: {
    margin: 0,
    color: '#334155'
  },
  progressBar: {
    marginTop: '1.25rem',
    height: '10px',
    borderRadius: '999px',
    background: '#e2e8f0',
    overflow: 'hidden'
  },
  progressValue: {
    height: '100%',
    background: 'linear-gradient(90deg, #2563eb, #8b5cf6)'
  }
};
