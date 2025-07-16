declare module 'dagre' {
  export = dagre;
  namespace dagre {
    class graphlib {
      static Graph: any;
    }
    function layout(graph: any): void;
  }
} 