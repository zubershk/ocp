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
      return "bg-[var(--color-brand-50)] text-[var(--color-brand-600)] ring-1 ring-[var(--color-brand-600)]/20";
    }
    if (lowercaseText === "hot") {
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
    }
    if (lowercaseText === "spicy") {
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    }
    if (lowercaseText === "bestseller") {
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20";
    }
    return "bg-[var(--color-brand-50)] text-[var(--color-brand-600)] ring-1 ring-[var(--color-brand-600)]/20";
  };

  return (
    <Card className={cn("group flex max-w-[270px] flex-col gap-0 rounded-2xl bg-card p-0 transition-all overflow-hidden ring-0 border shrink-0 justify-self-center", className,)} data-testid="product-card">
      <div className="relative overflow-hidden bg-muted/50 h-[120px] sm:h-[170px] shrink-0">
        {dietary && (
          <span
            className={`absolute bottom-2 left-2 z-10 flex h-4 w-4 items-center justify-center rounded-sm border-2 bg-white ${dietary === 'veg' ? 'border-emerald-600' : 'border-red-600'}`}
            title={dietary === 'veg' ? 'Veg' : 'Non-veg'}
          >
            <span className={`h-2 w-2 rounded-full ${dietary === 'veg' ? 'bg-emerald-600' : 'bg-red-600'}`} />
          </span>
        )}
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "absolute left-2 top-2 z-10 rounded-full border-0 px-1.5 py-0 text-[10px] capitalize",
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
          className="group/wishlist absolute right-2 top-2 z-10 size-7 rounded-full bg-background transition-transform hover:scale-110 cursor-pointer active:scale-95"
          onClick={() => {
            const next = !isWishlisted;
            setIsWishlisted(next);
            onWishlist?.(next);
          }}
        >
          <Heart
            className={cn(
              "size-3.5 transition-all duration-200 ease-out",
              isWishlisted
                ? "fill-red-500 text-red-500 scale-125"
                : "text-foreground scale-100",
            )}
          />
          <span className="sr-only">{isWishlisted ? "Remove from wishlist" : "Add to wishlist"}</span>
        </Button>
        {id ? (
          <Link to={`/r/menu/item/${id}`} className="block w-full h-full">
            <img
              src={image}
              alt={name}
              width={400}
              height={300}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </Link>
        ) : (
          <img
            src={image}
            alt={name}
            width={400}
            height={300}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <CardContent className="flex flex-col gap-2 p-4 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground capitalize sm:text-sm">
              {category.replace(/-/g, " ")}
            </span>
            {preparationTime ? (
              <span className="text-[10px] text-zinc-400 font-medium sm:text-xs">{preparationTime} min</span>
            ) : null}
          </div>
          {id ? (
            <Link to={`/r/menu/item/${id}`} className="hover:text-primary transition-colors">
              <p className="line-clamp-1 text-base sm:text-lg font-medium text-foreground">
                {name}
              </p>
            </Link>
          ) : (
            <p className="line-clamp-1 text-base sm:text-lg font-medium text-foreground">
              {name}
            </p>
          )}
          {description ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {rating > 0 && (
            <div className="flex items-center gap-1">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3 w-3 sm:h-3.5 sm:w-3.5",
                      i < Math.floor(rating)
                        ? "fill-orange-400 text-orange-400"
                        : "fill-muted text-orange-400",
                    )}
                  />
                ))}
              </div>
              <small className="text-xs sm:text-sm text-foreground">{rating}</small>
              {reviews > 0 && <small className="text-xs sm:text-sm text-foreground">({reviews})</small>}
            </div>
          )}
          <div className="flex items-center gap-1">
            <small className="text-base sm:text-lg font-medium text-foreground">
              ₹{price}
            </small>
            {originalPrice && (
              <small className="text-xs sm:text-sm font-medium text-muted-foreground line-through">
                ₹{originalPrice}
              </small>
            )}
          </div>
        </div>
        <Button
          type="button"
          className="w-full gap-2 h-10 cursor-pointer hover:bg-primary/80 mt-auto shrink-0 transition-all duration-200 touch-target"
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
