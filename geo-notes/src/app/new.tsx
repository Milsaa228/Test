import { router, useLocalSearchParams } from 'expo-router';

import { NoteForm } from '../components/NoteForm';
import { useNotes } from '../context/NotesContext';
import { isValidLatLng } from '../lib/geo';

export default function NewNoteScreen() {
  const { addNote } = useNotes();
  const { lat, lng } = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const point = { latitude: Number(lat), longitude: Number(lng) };

  return (
    <NoteForm
      initialPoint={lat && lng && isValidLatLng(point) ? point : null}
      submitLabel="Сохранить заметку"
      onSubmit={async (input) => {
        const note = await addNote(input);
        router.replace(`/note/${note.id}`);
      }}
    />
  );
}
