import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handle(e) {
    e.preventDefault();
    setLoading(true);
    const res = await signIn('credentials', { redirect: false, email, name });
    setLoading(false);
    if (res?.ok) router.push('/');
    else alert('Sign-in failed');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <form onSubmit={handle} style={{ width: 420, padding: 24, borderRadius: 12, background: 'white', boxShadow: '0 10px 30px rgba(2,6,23,0.08)' }}>
        <h2>Sign in (demo)</h2>
        <label style={{ display: 'block', marginTop: 12 }}>Email</label>
        <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" required style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e6eefc' }} />
        <label style={{ display: 'block', marginTop: 12 }}>Name (optional)</label>
        <input value={name} onChange={(e)=>setName(e.target.value)} type="text" style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #e6eefc' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button disabled={loading} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 8 }}>{loading ? 'Signing...' : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
