import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
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

  const getBadgeStyles = (text: string) => {
    const lowercaseText = text.toLowerCase();
    if (lowercaseText.includes("%") || lowercaseText === "sale") {
      return "bg-red-500/10 text-red-500";
    }
    if (lowercaseText === "new") {
      return "bg-blue-500/10 text-blue-500";
    }
    if (lowercaseText === "hot") {
      return "bg-orange-400/10 text-orange-400";
    }
    if (lowercaseText === "spicy") {
      return "bg-red-500/10 text-red-600";
    }
    if (lowercaseText === "bestseller") {
      return "bg-amber-500/10 text-amber-700";
    }
    return "bg-primary/10 text-primary";
  };

  return (
    <Card className={cn("group flex flex-col gap-0 rounded-2xl bg-card p-0 transition-all overflow-hidden ring-0 border w-[270px] h-[410px] shrink-0", className,)}>
      <div className="relative overflow-hidden bg-muted/50 h-[170px] shrink-0">
        {dietary && (
          <span
            className={`absolute bottom-2.5 left-2.5 z-10 flex h-5 w-5 items-center justify-center rounded-sm border-2 bg-white ${dietary === 'veg' ? 'border-emerald-600' : 'border-red-600'}`}
            title={dietary === 'veg' ? 'Veg' : 'Non-veg'}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${dietary === 'veg' ? 'bg-emerald-600' : 'bg-red-600'}`} />
          </span>
        )}
        {badge && (
          <Badge
            variant="outline"
            className={cn(
              "absolute left-4 top-[22px] z-10 rounded-full border-0 px-2 py-0.5 text-xs capitalize",
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
          className="group/wishlist absolute right-4 top-4 z-10 size-8 rounded-full bg-background transition-transform hover:scale-110 cursor-pointer"
          onClick={() => {
            const next = !isWishlisted;
            setIsWishlisted(next);
            onWishlist?.(next);
          }}
        >
          <Heart
            className={cn(
              "size-4 transition-all duration-300",
              isWishlisted
                ? "fill-red-500 text-red-500 scale-110"
                : "text-foreground",
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
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
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
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        )}
      </div>
      <CardContent className="flex flex-col gap-3 p-5 flex-1 min-h-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground capitalize">
              {category.replace(/-/g, " ")}
            </span>
            {preparationTime ? (
              <span className="text-xs text-zinc-400 font-medium">{preparationTime} min</span>
            ) : null}
          </div>
          {id ? (
            <Link to={`/r/menu/item/${id}`} className="hover:text-primary transition-colors">
              <p className="line-clamp-1 text-lg font-medium text-foreground">
                {name}
              </p>
            </Link>
          ) : (
            <p className="line-clamp-1 text-lg font-medium text-foreground">
              {name}
            </p>
          )}
          {description ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
          {rating > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-3.5 w-3.5",
                      i < Math.floor(rating)
                        ? "fill-orange-400 text-orange-400"
                        : "fill-muted text-orange-400",
                    )}
                  />
                ))}
              </div>
              <small className="text-sm text-foreground">{rating}</small>
              <small className="text-sm text-foreground">({reviews})</small>
            </div>
          )}
          <div className="flex items-center gap-2">
            <small className="text-lg font-medium text-foreground">
              ₹{price}
            </small>
            {originalPrice && (
              <small className="text-lg font-medium text-muted-foreground line-through">
                ₹{originalPrice}
              </small>
            )}
          </div>
        </div>
        <Button
          type="button"
          className="w-full gap-2 h-10 cursor-pointer hover:bg-primary/80 mt-auto shrink-0"
          onClick={onAddToCart}
        >
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
