import { useState } from 'react';
import { Calendar, Clock, Users } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const slots = ['11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM','4:00 PM','6:00 PM','7:00 PM','8:00 PM','9:00 PM','10:00 PM','11:00 PM'];

export default function Reservations(){
  const { push } = useToast();
  const [done,setDone]=useState(false);
  const [form,setForm]=useState({ name:'', phone:'', email:'', date:'', time:'', guests:'2', request:'' });
  if (done) return (
    <div className="max-w-xl mx-auto px-4 py-12 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-green-600">✓</div>
      <h2 className="text-2xl font-bold mt-4">Reservation confirmed!</h2>
      <p className="text-sm text-zinc-600 mt-2">We have reserved a table for {form.guests} guests on {form.date} at {form.time}. Confirmation sent to {form.phone}.</p>
      <button onClick={()=>setDone(false)} className="mt-6 px-6 py-3 rounded-xl bg-zinc-900 text-white font-semibold">Make another reservation</button>
    </div>
  );
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid lg:grid-cols-2 gap-8">
      <div>
        <h1 className="text-3xl font-bold">Reserve a Table</h1>
        <p className="text-zinc-500 mt-2">Vasai West • Mira Road East • Bhayandar West • Free home delivery 11AM–4AM</p>
        <form onSubmit={e=>{e.preventDefault(); if(!form.name || !form.phone || !form.date || !form.time) { push({ type:'error', title:'Please fill required fields'}); return; } setDone(true); push({ type:'success', title:'Reservation confirmed'});}} className="mt-6 bg-white rounded-2xl border p-6 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-medium">Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Full name" required/></div>
            <div><label className="text-xs font-medium">Phone *</label><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Mobile number" required/></div>
            <div className="sm:col-span-2"><label className="text-xs font-medium">Email</label><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Email (optional)"/></div>
            <div><label className="text-xs font-medium flex items-center gap-1"><Calendar size={12}/> Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border" required/></div>
            <div><label className="text-xs font-medium flex items-center gap-1"><Users size={12}/> Guests *</label><select value={form.guests} onChange={e=>setForm({...form,guests:e.target.value})} className="mt-1 w-full px-3 py-2.5 rounded-xl border">
              {[1,2,3,4,5,6,7,8].map(n=> <option key={n} value={String(n)}>{n} Person{n>1?'s':''}</option>)}
            </select></div>
          </div>
          <div>
            <label className="text-xs font-medium flex items-center gap-1"><Clock size={12}/> Time Slot *</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
              {slots.map(s=>(
                <button type="button" key={s} onClick={()=>setForm({...form,time:s})} className={`px-3 py-2 rounded-xl border text-xs font-medium ${form.time===s ? 'bg-orange-600 text-white border-orange-600' : 'bg-white hover:bg-zinc-50'}`}>{s}</button>
              ))}
            </div>
          </div>
          <div><label className="text-xs font-medium">Special Request</label><textarea value={form.request} onChange={e=>setForm({...form,request:e.target.value})} rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border" placeholder="Birthday, anniversary, Jain, spicy preference..."/></div>
          <button type="submit" className="w-full py-3.5 rounded-xl bg-orange-600 text-white font-semibold hover:bg-orange-700">Reserve a Table</button>
          <p className="text-xs text-zinc-500 text-center">Mock reservation • No backend yet • Stored locally</p>
        </form>
      </div>
      <div className="space-y-4">
        <img src="/uploads/94a2c1d2cd873119.jpg" alt="Restaurant" className="w-full h-56 object-cover rounded-2xl"/>
        <div className="bg-white rounded-2xl border p-6">
          <h3 className="font-semibold">Why dine with us?</h3>
          <ul className="mt-3 space-y-2 text-sm text-zinc-600">
            <li>• Fresh hand-tossed pizzas with 100% real mozzarella</li>
            <li>• 6 crusts & 28+ pizza varieties (veg & non-veg)</li>
            <li>• Desi Tadka range: Hyderabadi & Lucknowi flavours</li>
            <li>• Family packs & fun meal boxes for groups</li>
            <li>• All prices include tax • Free delivery till 4 AM</li>
          </ul>
        </div>
      </div>
    </div>
  )
}