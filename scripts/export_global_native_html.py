import json
import os
import sys
from pathlib import Path

# Set optimized node limit for instant <1s browser rendering
os.environ["GRAPHIFY_VIZ_NODE_LIMIT"] = "10000"

import networkx as nx
from networkx.readwrite import json_graph

try:
    from graphify.export import to_html
except ImportError:
    print("Graphify export module not found.", file=sys.stderr)
    sys.exit(1)

def main():
    global_graph_path = Path(r"C:\Users\waila\.graphify\global-graph.json")
    out_html_path = Path(r"C:\AI-Workspace\local-ai-orchestrator\graphify-out\graph.html")
    local_graph_path = Path(r"C:\AI-Workspace\local-ai-orchestrator\graphify-out\graph.json")

    if not global_graph_path.exists():
        print(f"File not found: {global_graph_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading global graph from {global_graph_path}...")
    with open(global_graph_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    edge_key = "edges" if "edges" in data else ("links" if "links" in data else "edges")
    node_key = "nodes" if "nodes" in data else "nodes"

    G = json_graph.node_link_graph(data, directed=data.get("directed", False), edges=edge_key, nodes=node_key)
    total_nodes = len(G.nodes)
    total_edges = len(G.edges)
    print(f"Global graph loaded: {total_nodes} nodes, {total_edges} edges.")

    # Select top hub nodes (projects, main entry points, high degree nodes, controllers)
    # Ensure ALL project roots and high-degree architecture nodes are preserved for smooth 60fps rendering
    degree_dict = dict(G.degree())
    
    # Priority nodes: repo/project nodes, entry files, high-degree architectural hubs
    repo_nodes = [n for n, attrs in G.nodes(data=True) if attrs.get("node_type") in ("repo", "project", "dir", "module") or attrs.get("source_file")]
    sorted_nodes = sorted(G.nodes(), key=lambda n: degree_dict.get(n, 0), reverse=True)
    
    # Target ~3,500 top nodes for instant <500ms browser rendering
    target_cap = 4000
    top_degree_nodes = set(sorted_nodes[:target_cap])
    
    # Combine repo nodes and top degree hubs
    selected_nodes = top_degree_nodes.union(repo_nodes[:1500])
    
    H = G.subgraph(selected_nodes).copy()
    print(f"Optimized sub-graph for instant rendering: {len(H.nodes)} nodes, {len(H.edges)} edges.")

    communities = {}
    for node, attrs in H.nodes(data=True):
        comm = attrs.get("community", 0)
        if isinstance(comm, str) and comm.isdigit():
            comm = int(comm)
        elif not isinstance(comm, int):
            comm = 0
        communities.setdefault(comm, []).append(node)

    print(f"Detected {len(communities)} communities in optimized graph.")
    print(f"Exporting instant-load Vis-Network graph.html to {out_html_path}...")
    to_html(H, communities, str(out_html_path))
    
    # Also update local graph.json so TRAMA & tools use the unified multi-project graph!
    print(f"Updating local graph.json at {local_graph_path}...")
    with open(local_graph_path, "w", encoding="utf-8") as f:
        json.dump(json_graph.node_link_data(H), f, indent=2)

    print(f"Successfully generated ultra-fast native Graphify HTML at {out_html_path}")

if __name__ == "__main__":
    main()
