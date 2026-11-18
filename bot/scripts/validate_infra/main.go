// Command validate_infra statically validates the Docker Compose topology and
// nginx configs without needing a Docker daemon. It catches the failure modes
// that only show up at `docker compose up`: dangling depends_on targets,
// undefined volumes, missing Dockerfiles, unresolved required env vars, and
// nginx upstreams pointing at services that do not exist.
//
// Usage: go run ./scripts/validate_infra -root <repo-root>
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var (
	envRefRe     = regexp.MustCompile(`\$\{([A-Z0-9_]+)(?::\-[^}]*)?(\:[^}]*)?\}`)
	upstreamRe   = regexp.MustCompile(`(?m)^\s*upstream\s+([A-Za-z0-9_]+)\s*\{`)
	serverRe     = regexp.MustCompile(`(?m)^\s*server\s+([A-Za-z0-9_.-]+):\d+`)
	proxyPassRe  = regexp.MustCompile(`proxy_pass\s+http://([A-Za-z0-9_.-]+)`)
	tomlAppRe    = regexp.MustCompile(`(?m)^app\s*=\s*"([^"]+)"`)
	tomlDockerRe = regexp.MustCompile(`(?m)^\s*dockerfile\s*=\s*"([^"]+)"`)
	caddyProxyRe = regexp.MustCompile(`reverse_proxy\s+([A-Za-z0-9_.-]+):\d+`)
)

// firstOr returns the first element of a regex submatch or a fallback.
func firstOr(m []string, fallback string) string {
	if len(m) > 1 && m[1] != "" {
		return m[1]
	}
	return fallback
}

// readFile reports a clear failure and returns nil when a path is missing.
func readFile(root, rel string, check func(bool, string, ...interface{})) []byte {
	p := filepath.Join(root, rel)
	b, err := os.ReadFile(p)
	check(err == nil, "%s is missing or unreadable: %v", rel, err)
	return b
}

type compose struct {
	Services map[string]struct {
		DependsOn interface{} `yaml:"depends_on"`
		Build     *struct {
			Context    string `yaml:"context"`
			Dockerfile string `yaml:"dockerfile"`
		} `yaml:"build"`
		Volumes []string `yaml:"volumes"`
	} `yaml:"services"`
	Volumes map[string]interface{} `yaml:"volumes"`
}

func main() {
	rootFlag := flag.String("root", ".", "repository root")
	preflight := flag.Bool("preflight", false, "also validate required env vars in the current environment")
	flag.Parse()
	root, _ := filepath.Abs(*rootFlag)

	fail := 0
	check := func(ok bool, format string, args ...interface{}) {
		if !ok {
			fmt.Printf("  FAIL: "+format+"\n", args...)
			fail++
		}
	}

	// --- compose ---
	path := filepath.Join(root, "docker-compose.yml")
	data, err := os.ReadFile(path)
	if err != nil {
		fmt.Println("FAIL: cannot read docker-compose.yml:", err)
		os.Exit(1)
	}
	var c compose
	if err := yaml.Unmarshal(data, &c); err != nil {
		fmt.Println("FAIL: invalid docker-compose.yml YAML:", err)
		os.Exit(1)
	}
	fmt.Printf("compose: %d services, %d named volumes\n", len(c.Services), len(c.Volumes))

	services := make([]string, 0, len(c.Services))
	for name := range c.Services {
		services = append(services, name)
	}
	sort.Strings(services)
	serviceSet := map[string]bool{}
	for _, s := range services {
		serviceSet[s] = true
	}

	requiredEnv := map[string]bool{}
	for _, name := range services {
		svc := c.Services[name]
		switch d := svc.DependsOn.(type) {
		case map[string]interface{}:
			for dep := range d {
				check(serviceSet[dep], "service %q depends on undefined service %q", name, dep)
			}
		case []interface{}:
			for _, v := range d {
				dep := fmt.Sprint(v)
				check(serviceSet[dep], "service %q depends on undefined service %q", name, dep)
			}
		}
		if svc.Build != nil {
			ctx := svc.Build.Context
			if ctx == "" || ctx == "." {
				ctx = root
			} else {
				ctx = filepath.Join(root, ctx)
			}
			df := svc.Build.Dockerfile
			if df == "" {
				df = "Dockerfile"
			}
			_, err := os.Stat(filepath.Join(ctx, df))
			check(err == nil, "service %q Dockerfile missing: %s", name, filepath.Join(ctx, df))
		}
		for _, v := range svc.Volumes {
			parts := strings.SplitN(v, ":", 2)
			if len(parts) < 2 {
				continue
			}
			src := parts[0]
			if strings.HasPrefix(src, ".") || strings.HasPrefix(src, "/") || strings.HasPrefix(src, "~") {
				_, err := os.Stat(filepath.Join(root, src))
				check(err == nil, "service %q bind mount source missing: %s", name, src)
			} else if src != "" {
				_, ok := c.Volumes[src]
				check(ok, "service %q uses undefined volume %q", name, src)
			}
		}
	}
	for _, ref := range envRefRe.FindAllStringSubmatch(string(data), -1) {
		if ref[2] != "" { // ${VAR:?message} — required
			requiredEnv[ref[1]] = true
		}
	}
	req := make([]string, 0, len(requiredEnv))
	for k := range requiredEnv {
		req = append(req, k)
	}
	sort.Strings(req)
	fmt.Println("required env vars (must be set before deploy):", strings.Join(req, ", "))

	if *preflight {
		fmt.Println("\n--- preflight (current environment) ---")
		for _, name := range req {
			v := strings.TrimSpace(os.Getenv(name))
			check(v != "", "required env var %s is not set", name)
		}
		warn := func(cond bool, msg string) {
			if cond {
				fmt.Printf("  WARN: %s\n", msg)
			}
		}
		warn(strings.EqualFold(os.Getenv("SINGLE_TENANT_MODE"), "true") || os.Getenv("SINGLE_TENANT_MODE") == "",
			"SINGLE_TENANT_MODE is true/unset — set false for multi-tenant SaaS")
		warn(strings.TrimSpace(os.Getenv("TRUSTED_PROXIES")) == "",
			"TRUSTED_PROXIES unset — rate limits will key on the load balancer IP behind a proxy")
		warn(len(os.Getenv("BOT_ADMIN_KEY")) < 24, "BOT_ADMIN_KEY looks short (<24 chars)")
		warn(strings.TrimSpace(os.Getenv("OTP_PEPPER")) == "", "OTP_PEPPER unset — OTP hashes are unpeppered")
		warn(strings.EqualFold(os.Getenv("STORAGE_BACKEND"), "s3") && strings.TrimSpace(os.Getenv("STORAGE_BUCKET")) == "",
			"STORAGE_BACKEND=s3 but STORAGE_BUCKET is empty")
		warn(strings.EqualFold(os.Getenv("PUBLIC_READ_CACHE_TTL_SECS"), "0"),
			"PUBLIC_READ_CACHE_TTL_SECS=0 — storefront reads will hit Postgres on every request")
		warn(os.Getenv("ETAG_ENABLED") != "1" && os.Getenv("ETAG_ENABLED") != "true",
			"ETAG_ENABLED is off — browsers cannot revalidate with 304")
		fmt.Println("preflight complete")
	}

	// --- nginx configs ---
	nginxFiles := []string{"bot-lb.conf", filepath.Join("frontend", "nginx.conf"), filepath.Join("frontend", "nginx-main.conf")}
	for _, rel := range nginxFiles {
		p := filepath.Join(root, rel)
		b, err := os.ReadFile(p)
		if err != nil {
			fmt.Printf("  FAIL: nginx config missing: %s\n", rel)
			fail++
			continue
		}
		s := string(b)
		opens, closes := strings.Count(s, "{"), strings.Count(s, "}")
		check(opens == closes, "%s: unbalanced braces (%d open, %d close)", rel, opens, closes)

		upstreams := map[string]bool{}
		for _, m := range upstreamRe.FindAllStringSubmatch(s, -1) {
			upstreams[m[1]] = true
		}
		for _, m := range serverRe.FindAllStringSubmatch(s, -1) {
			host := m[1]
			check(serviceSet[host] || upstreams[host], "%s: upstream server %q is neither a compose service nor a local upstream", rel, host)
		}
		for _, m := range proxyPassRe.FindAllStringSubmatch(s, -1) {
			host := m[1]
			check(serviceSet[host] || upstreams[host], "%s: proxy_pass target %q is neither a compose service nor a local upstream", rel, host)
		}
		fmt.Printf("%s: %d upstream(s), braces balanced\n", rel, len(upstreams))
	}

	// --- deployment configs (Vercel + Fly + VPS) ---
	fmt.Println("\n--- deployment configs ---")

	// vercel.json must build frontend/ into frontend/dist and rewrite SPAs.
	if vb := readFile(root, "vercel.json", check); vb != nil {
		var v struct {
			OutputDirectory string `json:"outputDirectory"`
			BuildCommand    string `json:"buildCommand"`
			InstallCommand  string `json:"installCommand"`
			Rewrites        []struct {
				Source string `json:"source"`
			} `json:"rewrites"`
		}
		check(json.Unmarshal(vb, &v) == nil, "vercel.json is not valid JSON")
		check(v.OutputDirectory == "frontend/dist", "vercel.json outputDirectory = %q, want frontend/dist", v.OutputDirectory)
		check(strings.Contains(v.BuildCommand, "frontend"), "vercel.json buildCommand does not reference frontend/")
		check(strings.Contains(v.InstallCommand, "frontend"), "vercel.json installCommand does not reference frontend/")
		check(len(v.Rewrites) > 0, "vercel.json has no SPA rewrite (client-side routes would 404)")
		fmt.Println("vercel.json: OK")
	}

	// Fly configs: app name, Dockerfile existence, and always-on guarantees.
	// (Lightweight regex checks — no TOML dependency needed.)
	for _, name := range []string{"fly.bot.toml", "fly.campaign.toml", "fly.evolution.toml"} {
		b := readFile(root, name, check)
		if b == nil {
			continue
		}
		s := string(b)
		app := tomlAppRe.FindStringSubmatch(s)
		check(len(app) == 2 && app[1] != "", "%s: missing app name", name)
		if strings.Contains(s, "TODO: rename") {
			fmt.Printf("  WARN: %s still has a placeholder app name — rename before deploy\n", name)
		}
		df := tomlDockerRe.FindStringSubmatch(s)
		check(len(df) == 2 && df[1] != "", "%s: missing dockerfile", name)
		if len(df) == 2 {
			_, err := os.Stat(filepath.Join(root, df[1]))
			check(err == nil, "%s: Dockerfile missing: %s", name, df[1])
		}
		check(strings.Contains(s, "auto_stop_machines = false"),
			"%s: auto_stop_machines must be false (SSE/workers/scheduler would die)", name)
		check(strings.Contains(s, "min_machines_running = 1"),
			"%s: min_machines_running must be >= 1", name)
		check(strings.Contains(s, "[[http_service.checks]]"), "%s: no health check defined", name)
		fmt.Printf("%s: OK (app=%s)\n", name, firstOr(app, "?"))
	}

	// Workflows + prod compose override parse as YAML. Strip Compose's custom
	// !reset tag first (standard YAML parsers don't know it).
	for _, rel := range []string{
		".github/workflows/deploy-frontend-vercel.yml",
		".github/workflows/deploy-backend-fly.yml",
		filepath.Join("deploy", "vps", "docker-compose.prod.yml"),
	} {
		b := readFile(root, rel, check)
		if b == nil {
			continue
		}
		s := strings.ReplaceAll(string(b), "!reset ", "")
		var out interface{}
		check(yaml.Unmarshal([]byte(s), &out) == nil, "%s: invalid YAML", rel)
		fmt.Printf("%s: OK\n", rel)
	}

	// Caddyfile: balanced braces and every reverse_proxy target is a service.
	if cb := readFile(root, filepath.Join("deploy", "vps", "Caddyfile"), check); cb != nil {
		s := string(cb)
		check(strings.Count(s, "{") == strings.Count(s, "}"), "Caddyfile: unbalanced braces")
		for _, m := range caddyProxyRe.FindAllStringSubmatch(s, -1) {
			check(serviceSet[m[1]], "Caddyfile: reverse_proxy target %q is not a compose service", m[1])
		}
		fmt.Println("Caddyfile: OK")
	}

	// VPS env template must pre-fill every required compose variable.
	if eb := readFile(root, filepath.Join("deploy", "vps", ".env.example"), check); eb != nil {
		for name := range requiredEnv {
			check(strings.Contains(string(eb), name+"="), "deploy/vps/.env.example missing required var %s", name)
		}
		fmt.Println("deploy/vps/.env.example: OK")
	}

	if fail > 0 {
		fmt.Printf("\n%d validation error(s)\n", fail)
		os.Exit(1)
	}
	fmt.Println("\nInfrastructure config OK")
}
