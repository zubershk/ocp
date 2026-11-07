import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Star, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Card, CardContent } from "@/components/shadcn/card";

export interface ProductCardProps {
  id?: number | string;
  image: string;
  category: string;
  name: string;
  description?: string;
  dietary?: string;
  preparationTime?: number;
  rating: number;
  reviews: number;
  price: number;
  originalPrice?: number;
  badge?: {
    text: string;
  };
  className?: string;
  actionLabel?: string;
  onAddToCart?: () => void;
  onWishlist?: (wishlisted: boolean) => void;
}

export function ProductCard({
  id,
  image,
  category,
  name,
  description,
  dietary,
  preparationTime,
  rating,
  reviews,
  price,
  originalPrice,
  badge,
  className,
  actionLabel = "Add to Cart",
  onAddToCart,
  onWishlist,
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const FALLBACK_IMG = 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop';
  const imgSrc = !image || imgFailed ? FALLBACK_IMG : image;

  const handleAddToCart = async () => {
    setIsAdding(true);
    await onAddToCart?.();
    setAdded(true);
    setTimeout(() => {
      setIsAdding(false);
      setAdded(false);
    }, 1500);
  };

  const getBadgeStyles = (text: string) => {
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes("%") || lowercaseText === "sale") {
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
    }
    if (lowercaseText === "new") {
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
    }
    if (lowercaseText === "hot") {
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    }
    if (lowercaseText === "bestseller") {
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
    }
    return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
  };

  return (
    <Card
      className={cn(
        "group relative w-full max-w-[340px] flex flex-col gap-0 rounded-3xl bg-card p-0 transition-all overflow-hidden ring-0 border border-stone-200/50 shrink-0 justify-self-center h-[520px]",
        className,
      )}
      data-testid="product-card"
    >
      {/* Image area - premium product photography */}
      <div className="relative overflow-hidden bg-stone-50 h-[260px] shrink-0">
        {/* Subtle gradient overlay for depth */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/10 to-transparent" />
        {dietary && (
          <span
            className={`absolute bottom-3 left-3 z-10 flex h-5 w-5 items-center justify-center rounded-sm border-2 bg-white ${dietary === 'veg' ? 'border-emerald-600' : 'border-red-600'}`}
            title={dietary === 'veg' ? 'Veg' : 'Non-veg'}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${dietary === 'veg' ? 'bg-emerald-600' : 'bg-red-600'}`} />
          </span>
        )}
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "absolute left-3 top-3 z-10 rounded-full border-0 px-2 py-0.5 text-xs capitalize shadow-sm",
              getBadgeStyles(badge.text),
            )}
          >
            {badge.text}
          </Badge>
        )}
        <Button
          type="button"
          size="icon-sm"
          aria-pressed={isWishlisted}
          className="group/wishlist absolute right-3 top-3 z-10 size-8 rounded-full bg-white/95 transition-transform hover:scale-110 cursor-pointer active:scale-95 shadow-sm"
          onClick={() => {
            const next = !isWishlisted;
            setIsWishlisted(next);
            onWishlist?.(next);
          }}
        >
          <Heart
            className={cn(
              "size-4 transition-all duration-200 ease-out",
              isWishlisted
                ? "fill-red-500 text-red-500 scale-125"
                : "text-stone-500 scale-100",
            )}
          />
          <span className="sr-only">{isWishlisted ? "Remove from wishlist" : "Add to wishlist"}</span>
        </Button>
        {id ? (
          <Link to={`/r/menu/item/${id}`} className="block w-full h-full">
            <img
              src={imgSrc}
              alt={name}
              onError={() => setImgFailed(true)}
              width={400}
              height={300}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        ) : (
          <img
            src={imgSrc}
            alt={name}
            width={400}
            height={300}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>

      {/* Content area */}
      <CardContent className="p-4 sm:p-5 flex flex-col gap-3 flex-1 shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground capitalize sm:text-sm">
              {category.replace(/-/g, " ")}
            </span>
            {preparationTime ? (
              <span className="text-[10px] text-muted-foreground font-medium sm:text-xs">
                {preparationTime} min
              </span>
            ) : null}
          </div>
          {id ? (
            <Link to={`/r/menu/item/${id}`} className="hover:text-primary transition-colors">
              <p className="line-clamp-1 text-base sm:text-lg font-semibold text-foreground leading-tight">
                {name}
              </p>
            </Link>
          ) : (
            <p className="line-clamp-1 text-base sm:text-lg font-semibold text-foreground leading-tight">
              {name}
            </p>
          )}
          {description ? (
            <p className="line-clamp-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          ) : null}
          {rating > 0 ? (
            <div className="flex items-center gap-1">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3 w-3 sm:h-3.5 sm:w-3.5",
                      i < Math.floor(rating)
                        ? "fill-orange-400 text-orange-400"
                        : "fill-stone-200 text-stone-200",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs sm:text-sm font-medium text-foreground">
                {rating.toFixed(1)}
              </span>
              {reviews > 0 && (
                <span className="text-[10px] text-muted-foreground">({reviews})</span>
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-base sm:text-lg font-bold text-foreground">
              ₹{price}
            </span>
            {originalPrice && (
              <span className="text-[10px] text-muted-foreground line-through">
                ₹{originalPrice}
              </span>
            )}
          </div>
        </div>
        <Button
          type="button"
          className="w-full gap-2 h-11 cursor-pointer hover:bg-brand-600 hover:text-white mt-auto shrink-0 transition-all duration-200 touch-target shadow-sm"
          onClick={handleAddToCart}
          disabled={isAdding}
        >
          {isAdding ? (
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
              Adding…
            </span>
          ) : added ? (
            <span className="flex items-center gap-1">
              <Check size={13} className="text-emerald-400" />
              Added!
            </span>
          ) : (
            actionLabel
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
