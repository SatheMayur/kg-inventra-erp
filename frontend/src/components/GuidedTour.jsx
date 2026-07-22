import React, { useState } from 'react';

const STEPS = [
  {
    title: '👋 Welcome to FG Inventory',
    description: "This system manages your Food & Grains inventory end-to-end. Let's take a quick tour of the key features.",
    position: 'center'
  },
  {
    title: '📦 Item Master',
    description: 'All your products live here. Each item gets an auto-generated item code (FG-0001) and EAN-13 barcode. Click "Add Item" to create new products, or scan a barcode to look up stock instantly.',
    target: 'nav-items',
    position: 'bottom'
  },
  {
    title: '🔍 Barcode Scanner',
    description: 'Go to Scan page and focus the input field. Point your barcode scanner at any product label — it types the barcode and hits Enter automatically, showing live stock and nearest expiry instantly.',
    target: 'nav-scan',
    position: 'bottom'
  },
  {
    title: '📥 Inward (Purchase)',
    description: 'When goods arrive: create an Inward Entry → add line items (or import from Excel) → Confirm (this creates FIFO batches with expiry dates) → Lock to finalize. Once locked, records cannot be edited.',
    target: 'nav-inward',
    position: 'bottom'
  },
  {
    title: '📤 Outward (Dispatch)',
    description: 'When goods leave: create Dispatch → add items → Confirm (system auto-selects oldest batches first — FIFO) → Lock to generate a Challan number. Print the challan for the delivery driver.',
    target: 'nav-outward',
    position: 'bottom'
  },
  {
    title: '⚠️ Reports & Alerts',
    description: 'Reports tab gives you: Expiry Alerts (red/amber/green), Low Stock warnings, Dead Stock items, and the full Margin/Shrinkage MIS. Run the nightly job manually anytime to refresh risk scores.',
    target: 'nav-reports',
    position: 'bottom'
  },
  {
    title: '👥 User Management',
    description: 'As Admin, you can create accounts for your team: Purchase, Warehouse, Sales, and View-only roles. Each role sees only what they need. Go to Users to manage your team.',
    target: 'nav-users',
    position: 'bottom'
  },
  {
    title: "✅ You're ready!",
    description: 'Demo data is already loaded — explore the Items page, check Reports for expiry alerts, and try creating an Inward entry. The system has 12 items, 3 inward receipts, and 2 dispatches ready to explore.',
    position: 'center'
  }
];

const TOTAL = STEPS.length;

const styles = {
  backdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 9000,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  card: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '480px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    padding: '24px',
    zIndex: 9001,
    fontFamily: 'Arial, sans-serif'
  },
  cardCenter: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '480px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    padding: '24px',
    zIndex: 9001,
    fontFamily: 'Arial, sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  stepLabel: {
    fontSize: '12px',
    color: '#888',
    fontWeight: '500'
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '2px 4px',
    textDecoration: 'underline'
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: '8px',
    lineHeight: '1.4'
  },
  description: {
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.6',
    marginBottom: '20px'
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  dots: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center'
  },
  dot: (active) => ({
    width: active ? '10px' : '8px',
    height: active ? '10px' : '8px',
    borderRadius: '50%',
    background: active ? '#2563eb' : 'transparent',
    border: active ? '2px solid #2563eb' : '2px solid #bbb',
    transition: 'all 0.2s'
  }),
  btnGroup: {
    display: 'flex',
    gap: '8px'
  },
  prevBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    background: '#f5f5f5',
    color: '#444',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  nextBtn: {
    padding: '8px 20px',
    borderRadius: '6px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  arrow: {
    position: 'fixed',
    bottom: '152px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: 0,
    height: 0,
    borderLeft: '10px solid transparent',
    borderRight: '10px solid transparent',
    borderBottom: '12px solid #fff',
    filter: 'drop-shadow(0 -2px 2px rgba(0,0,0,0.08))',
    zIndex: 9001
  }
};

export default function GuidedTour({ onDone }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOTAL - 1;
  const isCentered = current.position === 'center';

  function handleNext() {
    if (isLast) {
      onDone();
    } else {
      setStep(s => s + 1);
    }
  }

  function handlePrev() {
    if (step > 0) setStep(s => s - 1);
  }

  const cardStyle = isCentered ? styles.cardCenter : styles.card;

  return (
    <>
      {isCentered && <div style={styles.backdrop} onClick={() => {}} />}
      {!isCentered && <div style={styles.arrow} />}
      <div style={cardStyle}>
        <div style={styles.header}>
          <span style={styles.stepLabel}>Step {step + 1} of {TOTAL}</span>
          <button style={styles.skipBtn} onClick={onDone}>Skip</button>
        </div>

        <div style={styles.title}>{current.title}</div>
        <div style={styles.description}>{current.description}</div>

        <div style={styles.footer}>
          <div style={styles.dots}>
            {STEPS.map((_, i) => (
              <span key={i} style={styles.dot(i === step)} />
            ))}
          </div>
          <div style={styles.btnGroup}>
            {!isFirst && (
              <button style={styles.prevBtn} onClick={handlePrev}>
                &larr; Previous
              </button>
            )}
            <button style={styles.nextBtn} onClick={handleNext}>
              {isLast ? 'Get Started' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
