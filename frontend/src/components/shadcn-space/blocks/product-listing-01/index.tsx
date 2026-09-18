import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ProductCard,
  type ProductCardProps,
} from "@/components/shadcn-space/blocks/product-listing-01/product-card";

export interface ProductListingProps {
  products: ProductCardProps[];
}

export default function ProductListing({
  products,
}: ProductListingProps) {
  return (
    <section className="py-12 md:py-16 lg:py-20">
      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-16 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-semibold text-foreground">
              Featured products
            </h2>
            <p className="text-base text-muted-foreground">
              Handpicked by our team
            </p>
          </div>
          <Link
            to="/r/menu"
            className="items-center gap-2 text-sm font-medium flex group cursor-pointer"
          >
            See all
            <ArrowRight className="size-4 group-hover:translate-x-1 transition-all" />
          </Link>
        </div>

        <div className="w-full overflow-x-auto xl:[scrollbar-width:none] xl:[-ms-overflow-style:none] xl:[&::-webkit-scrollbar]:hidden">
          <div className="flex gap-6">
            {products.map((product) => (
              <div key={product.id ?? product.name} className="inline-block min-w-[270px] max-w-[270px] w-full whitespace-normal shrink-0">
                <ProductCard {...product} className="w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
