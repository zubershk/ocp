import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { setAdminKey } from '../../services/api';

/** Mirrors the Admin page gate: POS needs an admin key for X-Admin-Key auth. */
export default function PosAuthGate({ onAuthed }: { onAuthed: () => void }) {
  const [keyInput, setKeyInput] = useState('');

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-zinc-900 grid place-items-center">
          <KeyRound size={20} className="text-white" />
        </div>
        <h1 className="font-bold text-lg mt-4">POS terminal</h1>
        <p className="text-sm text-zinc-500 mt-1">Enter a staff admin key to open the register.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (keyInput.trim()) {
              setAdminKey(keyInput.trim());
              onAuthed();
            }
          }}
          className="mt-6 text-left space-y-3"
        >
          <Input
            label="Admin key"
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="paste staff key"
            autoComplete="off"
          />
          <Button type="submit" className="w-full" disabled={!keyInput.trim()}>
            Open register
          </Button>
        </form>
      </div>
    </div>
  );
}
