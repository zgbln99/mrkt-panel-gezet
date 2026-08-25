import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
// Import z konkretnej rodziny, a nie z indeksu paczki: `@expo/vector-icons`
// re-eksportuje kilkanaście zestawów i Metro dołączyłoby do aplikacji
// wszystkie ich pliki .ttf (ponad 3 MB), choć używamy wyłącznie Ionicons.
import Ionicons from '@expo/vector-icons/Ionicons';

import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../theme';
import { Loading, Button } from '../components/ui';

import SetupScreen from '../screens/SetupScreen';
import LoginScreen from '../screens/LoginScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import PublicFormScreen from '../screens/PublicFormScreen';
import TasksScreen from '../screens/TasksScreen';
import TaskDetailScreen from '../screens/TaskDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import RequestsLogScreen from '../screens/RequestsLogScreen';
import AccountsScreen from '../screens/AccountsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MoreScreen from '../screens/MoreScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const { colors } = useTheme();
  const { unread } = useData();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11.5 },
      }}
    >
      <Tab.Screen
        name="Tasks"
        component={TasksScreen}
        options={{
          title: 'Zadania',
          tabBarIcon: ({ color, size }) => <Ionicons name="checkbox-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="NewRequest"
        component={PublicFormScreen}
        options={{
          title: 'Zgłoszenie',
          tabBarIcon: ({ color, size }) => <Ionicons name="add-circle-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: 'Powiadomienia',
          // Licznik nieprzeczytanych jest jedynym powodem, dla którego ktoś
          // otwiera tę zakładkę — musi być widoczny bez wchodzenia w nią.
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{
          title: 'Więcej',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { colors, isDark } = useTheme();
  const { booting, user, apiUrl, needsPasswordChange } = useAuth();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.surface,
      text: colors.ink,
      border: colors.line,
    },
  };

  const screenOptions = {
    headerStyle: { backgroundColor: colors.surface },
    headerTintColor: colors.ink,
    headerTitleStyle: { fontWeight: '700' },
    contentStyle: { backgroundColor: colors.bg },
  };

  if (booting) {
    return (
      <View style={[styles.boot, { backgroundColor: colors.bg }]}>
        <Loading label="Wczytywanie…" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {!apiUrl ? (
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="Setup" component={SetupScreen} options={{ headerShown: false }} />
        </Stack.Navigator>
      ) : needsPasswordChange ? (
        // Konto z hasłem startowym nie ma dokąd pójść: serwer i tak odrzuca
        // każdą inną operację, dopóki hasło nie zostanie zmienione.
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen
            name="ForcePassword"
            component={ChangePasswordScreen}
            initialParams={{ forced: true }}
            options={{ title: 'Ustaw własne hasło' }}
          />
        </Stack.Navigator>
      ) : !user ? (
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen
            name="PublicForm"
            component={PublicFormScreen}
            options={({ navigation }) => ({
              title: 'Zgłoszenie do marketingu',
              headerRight: () => (
                <Button
                  title="Zaloguj"
                  variant="ghost"
                  onPress={() => navigation.navigate('Login')}
                  style={styles.headerButton}
                />
              ),
            })}
          />
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Panel zespołu', presentation: 'modal' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ustawienia' }} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={screenOptions}>
          <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: 'Szczegóły zadania' }} />
          <Stack.Screen
            name="ChangePassword"
            component={ChangePasswordScreen}
            options={{ title: 'Zmiana hasła', presentation: 'modal' }}
          />
          <Stack.Screen name="RequestsLog" component={RequestsLogScreen} options={{ title: 'Wszystkie zgłoszenia' }} />
          <Stack.Screen name="Accounts" component={AccountsScreen} options={{ title: 'Konta zespołu' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ustawienia' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, justifyContent: 'center' },
  headerButton: { paddingVertical: 4, paddingHorizontal: 8, minHeight: 32, borderWidth: 0 },
});
