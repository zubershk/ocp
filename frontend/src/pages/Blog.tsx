import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blog';
import { useRestaurantName } from '../context/RestaurantContext';

export default function Blog(){
  const restaurantName = useRestaurantName();
  const featured = blogPosts.find(b=>b.featured);
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold">Food Blog</h1>
      <p className="text-zinc-500 mt-1">Stories from {restaurantName || 'our restaurant'} — ingredients, desi tadka, new launches</p>
      {featured && (
        <Link to={`/blog/${featured.slug}`} className="mt-6 block bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition">
          <div className="grid lg:grid-cols-2">
            <img src={featured.coverImage} alt={featured.title} className="w-full h-64 lg:h-full object-cover"/>
            <div className="p-6">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-100 text-orange-700">{featured.category}</span>
              <h2 className="text-2xl font-bold mt-3 leading-tight">{featured.title}</h2>
              <p className="text-sm text-zinc-600 mt-2">{featured.excerpt}</p>
              <div className="flex items-center gap-2 mt-4 text-xs text-zinc-500"><img src={featured.author.avatar} alt="" className="w-6 h-6 rounded-full"/><span>{featured.author.name} • {featured.publishedAt.toLocaleDateString()} • {featured.readTime} min read</span></div>
            </div>
          </div>
        </Link>
      )}
      <div className="grid md:grid-cols-3 gap-5 mt-6">
        {blogPosts.filter(b=>!b.featured).map(post=>(
          <Link key={post.id} to={`/blog/${post.slug}`} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition">
            <img src={post.coverImage} alt={post.title} className="w-full h-44 object-cover"/>
            <div className="p-4">
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-100">{post.category}</span>
              <h3 className="font-semibold mt-2 leading-tight line-clamp-2">{post.title}</h3>
              <p className="text-xs text-zinc-500 line-clamp-2 mt-1">{post.excerpt}</p>
              <div className="text-xs text-zinc-500 mt-3">{post.publishedAt.toLocaleDateString()} • {post.readTime} min</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}