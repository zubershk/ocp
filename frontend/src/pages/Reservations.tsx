import { useState } from 'react';
import { Calendar, Clock, Users, CheckCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useOutletNames, useDeliveryHours, useRestaurantPhone } from '../context/RestaurantContext';
import { apiPost } from '../services/api';

const slots = ['11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM'];

export default function Reservations(){
  const { push } = useToast();
  const outletNames = useOutletNames();
  const deliveryHours = useDeliveryHours();
  const restaurantPhone = useRestaurantPhone();
  const [done,setDone]=useState(false);
  const [sending,setSending]=useState(false);
  const [form,setForm]=useState({ name:'', phone:'', email:'', date:'', time:'', guests:'2', request:'' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!form.name || !form.phone || !form.date || !form.time) { push({ type:'error', title:'Please fill required fields'}); return; }
    if(!/^[0-9]{10}$/.test(form.phone.replace(/\s|-/g,''))){ push({ type:'error', title:'Enter a 10-digit phone number'}); return; }
    setSending(true);
    try {
      const message = [
        `Table reservation request`,
        `Name: ${form.name}`,
        `Guests: ${form.guests}`,
        `Date: ${form.date}`,
        `Time: ${form.time}`,
        form.email ? `Email: ${form.email}` : '',
        form.request ? `Request: ${form.request}` : '',
      ].filter(Boolean).join('\n');
      await apiPost('/api/contact', {
        name: form.name.trim(),
        phone: form.phone.replace(/\s|-/g,''),
        email: form.email || undefined,
        category: 'reservation',
        priority: 'normal',
        message,
      });
      setDone(true);
    } catch (err) {
      push({ type:'error', title: err instanceof Error ? err.message : 'Could not send your request. Please call us.' });
    } finally {
      setSending(false);
    }
  };

  if (done) return (
    <div className="max-w-xl mx-auto px-4 py-12 text-center">
      <CheckCircle size={48} className="mx-auto text-emerald-600" />
      <h2 className="text-2xl font-bold mt-4">Reservation request received</h2>
      <p className="text-sm text-zinc-600 mt-2">
        We've noted a table for {form.guests} guests on {form.date} at {form.time}. Our team will call {form.phone} to confirm availability — this is not a confirmed booking yet.
      </p>
      {restaurantPhone && <p className="text-sm text-zinc-500 mt-2">Need to change something? Call us at {restaurantPhone}.</p>}
      <button onClick={()=>setDone(false)} className="mt-6 px-6 py-3 rounded-xl bg-zinc-900 text-white font-semibold">Make another request</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-3xl font-bold">Request a Table</h1>
      <p className="text-zinc-500 mt-2">{outletNames.join(' • ') || 'Our outlets'}. Submit a request and our team will confirm by phone.</p>
      <form onSubmit={submit} className="mt-6 bg-white rounded-2xl border p-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label htmlFor="res-name" className="text-xs font-medium">Name *</label><input id="res-name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Full name" required/></div>
          <div><label htmlFor="res-phone" className="text-xs font-medium">Phone *</label><input id="res-phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="10-digit mobile number" required/></div>
          <div className="sm:col-span-2"><label htmlFor="res-email" className="text-xs font-medium">Email</label><input id="res-email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Email (optional)"/></div>
          <div><label htmlFor="res-date" className="text-xs font-medium flex items-center gap-1"><Calendar size={12}/> Date *</label><input id="res-date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" required/></div>
          <div><label htmlFor="res-guests" className="text-xs font-medium flex items-center gap-1"><Users size={12}/> Guests</label><select id="res-guests" value={form.guests} onChange={e=>setForm({...form,guests:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border">
            {[1,2,3,4,5,6,7,8].map(n=> <option key={n} value={String(n)}>{n} Person{n>1?'s':''}</option>)}
          </select></div>
        </div>
        <div>
          <span className="text-xs font-medium flex items-center gap-1"><Clock size={12}/> Preferred Time *</span>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
            {slots.map(s=>(
              <button type="button" key={s} onClick={()=>setForm({...form,time:s})} aria-pressed={form.time===s} className={`px-3 py-2 rounded-xl border text-xs font-medium ${form.time===s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white hover:bg-zinc-50'}`}>{s}</button>
            ))}
          </div>
        </div>
        <div><label htmlFor="res-request" className="text-xs font-medium">Special Request</label><textarea id="res-request" value={form.request} onChange={e=>setForm({...form,request:e.target.value})} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Birthday, anniversary, Jain, spicy preference..."/></div>
        <button type="submit" disabled={sending} className="w-full py-3.5 rounded-xl bg-brand-600 text-white font-semibold disabled:opacity-50">{sending ? 'Sending…' : 'Request a Table'}</button>
        <p className="text-xs text-zinc-500 text-center">We'll call to confirm — this is a request, not a guaranteed booking.</p>
      </form>
    </div>
  );
}
