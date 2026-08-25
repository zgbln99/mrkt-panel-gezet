import React from 'react';

/**
 * Zabezpieczenie przed białym ekranem: wyjątek w dowolnym komponencie Reacta
 * odmontowuje całe drzewo, więc bez tej granicy użytkownik zobaczyłby pustą
 * stronę bez żadnej wskazówki, co dalej.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Błąd interfejsu:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="wrap">
        <div className="card" style={{ marginTop: 40 }}>
          <h3>Coś poszło nie tak</h3>
          <p style={{ color: 'var(--ink-soft)' }}>
            Aplikacja napotkała nieoczekiwany błąd. Odśwież stronę — jeśli problem się powtarza,
            przekaż tę informację osobie odpowiedzialnej za aplikację.
          </p>
          <pre className="draft-text" style={{ maxHeight: 160 }}>
            {String(this.state.error && this.state.error.message)}
          </pre>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Odśwież stronę
          </button>
        </div>
      </div>
    );
  }
}
