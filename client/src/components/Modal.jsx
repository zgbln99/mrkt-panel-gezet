import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Wspólna powłoka okna modalnego.
 *
 * Poza wyglądem odpowiada za obsługę klawiatury, której brakowało wcześniej:
 * zamknięcie Escape, przeniesienie fokusu do okna po otwarciu, uwięzienie
 * Taba w oknie i przywrócenie fokusu na element, z którego okno otwarto.
 * Bez tego osoby korzystające z klawiatury lub czytnika ekranu potrafią
 * "wypaść" za modal i klikać w tło, którego nie widać.
 */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, subtitle, onClose, children, dismissible = true }) {
  const cardRef = useRef(null);
  const restoreFocusTo = useRef(null);

  useEffect(() => {
    restoreFocusTo.current = document.activeElement;

    const first = cardRef.current && cardRef.current.querySelector(FOCUSABLE);
    if (first) first.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !cardRef.current) return;

      const items = Array.from(cardRef.current.querySelectorAll(FOCUSABLE)).filter((el) => !el.disabled);
      if (items.length === 0) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];

      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    // Tło nie ma się przewijać pod otwartym oknem.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusTo.current && restoreFocusTo.current.focus) restoreFocusTo.current.focus();
    };
  }, [onClose, dismissible]);

  return (
    <div className="modal-overlay" onMouseDown={dismissible ? onClose : undefined}>
      <div
        className="modal-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-hd">
          <h3>{title}</h3>
          {dismissible && (
            <button className="modal-x" onClick={onClose} aria-label="Zamknij okno">
              <X size={16} />
            </button>
          )}
        </div>
        {subtitle && <p className="modal-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
