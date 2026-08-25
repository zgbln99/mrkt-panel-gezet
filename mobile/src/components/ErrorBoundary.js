import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Wyjątek w komponencie odmontowuje całe drzewo Reacta — bez tej granicy
 * użytkownik zobaczyłby pusty ekran bez żadnej wskazówki.
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
      <View style={styles.wrap}>
        <Text style={styles.title}>Coś poszło nie tak</Text>
        <Text style={styles.text}>
          Aplikacja napotkała nieoczekiwany błąd. Zamknij ją i otwórz ponownie. Jeśli problem się
          powtarza, przekaż tę informację osobie odpowiedzialnej za aplikację.
        </Text>
        <Text style={styles.detail}>{String(this.state.error && this.state.error.message)}</Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#F0F2ED', gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: '#17211C' },
  text: { fontSize: 14.5, lineHeight: 21, color: '#515D55' },
  detail: { fontSize: 12.5, color: '#A23B2E', marginTop: 8 },
});
