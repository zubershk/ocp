import { useParams, Link } from 'react-router-dom';
import { blogPosts } from '../data/blog';
import { useOutletNames, useDeliveryHours } from '../context/RestaurantContext';

export default function BlogDetail(){
  const { slug } = useParams();
  const outletNames = useOutletNames();
  const deliveryHours = useDeliveryHours();
  const post = blogPosts.find(p=> p.slug===slug);
  if (!post) return <div className="max-w-3xl mx-auto px-4 py-12 text-center">Post not found. <Link to="/blog" className="text-orange-600">Back to blog</Link></div>;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link to="/blog" className="text-sm text-zinc-600 hover:text-zinc-900">← Back to blog</Link>
      <h1 className="text-3xl font-bold mt-4 leading-tight">{post.title}</h1>
      <div className="flex items-center gap-2 mt-3 text-sm text-zinc-500"><img src={post.author.avatar} alt="" className="w-8 h-8 rounded-full"/><span>{post.author.name} • {post.author.role}</span><span>• {post.publishedAt.toLocaleDateString()} • {post.readTime} min read</span></div>
      <img src={post.coverImage} alt={post.title} className="w-full h-64 sm:h-80 object-cover rounded-2xl mt-6"/>
      <p className="text-zinc-700 leading-relaxed mt-6">{post.content}</p>
      <p className="text-sm text-zinc-600 mt-4 leading-relaxed">All our pizzas use 100% real mozzarella and all prices include tax. Visit our outlets{outletNames.length > 0 ? ` in ${outletNames.join(', ')}` : ''} — or order online for free delivery {deliveryHours || '11AM–4AM'}.</p>
      <div className="mt-8 flex flex-wrap gap-2">{post.tags.map(t=> <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 border">#{t}</span>)}</div>
      <div className="mt-10 p-6 bg-orange-50 border border-orange-100 rounded-2xl">
        <h3 className="font-semibold">Craving now?</h3>
        <p className="text-sm text-zinc-600 mt-1">Order your favourite pizza — veg, non-veg, desi tadka, cheese burst.</p>
        <Link to="/r/menu" className="inline-flex mt-3 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold">Explore Menu</Link>
      </div>
    </div>
  )
}