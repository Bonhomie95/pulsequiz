import { Component, type ReactNode } from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { logger } from '@/src/utils/logger';

type Props = { children: ReactNode };
type State = { hasError: boolean };

/**
 * Catches render/lifecycle exceptions anywhere in the tree so a single bad
 * render shows a recoverable screen instead of a white/blank crash. Wrap the
 * root navigator in this.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: { componentStack: string }) {
    logger.error('Uncaught UI error', error, {
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>😵‍💫</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          The app hit an unexpected error. You can try again — your progress is
          safe.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            hitSlop={8}>
          <Text style={styles.btnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0B0F1A',
  },
  emoji: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 10 },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: '#A6B0CF',
    textAlign: 'center',
    marginBottom: 28,
  },
  btn: {
    backgroundColor: '#5B7CFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 16,
  },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
