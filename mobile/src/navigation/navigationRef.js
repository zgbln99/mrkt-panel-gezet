import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Referencja do nawigatora używana poza drzewem Reacta — konkretnie przy
 * dotknięciu powiadomienia systemowego, które przychodzi z warstwy natywnej,
 * a nie z żadnego ekranu.
 */
export const navigationRef = createNavigationContainerRef();

// Powiadomienie, które uruchomiło zamkniętą aplikację, trafia do nas zanim
// nawigator zdąży się zamontować. Zapamiętujemy je i otwieramy przy
// onReady — inaczej dotknięcie powiadomienia wyrzucałoby użytkownika na
// ekran startowy zamiast na zadanie, którego dotyczyło.
let pendingTaskId = null;

export function openTask(taskId) {
  if (!taskId) return false;
  if (!navigationRef.isReady()) {
    pendingTaskId = taskId;
    return false;
  }
  navigationRef.navigate('TaskDetail', { taskId });
  return true;
}

export function flushPendingTask() {
  if (!pendingTaskId) return;
  const taskId = pendingTaskId;
  pendingTaskId = null;
  openTask(taskId);
}
