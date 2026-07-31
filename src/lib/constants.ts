// How many times a single node can be broken down before Knavi stops and
// tells the student to just try it / look things up themselves instead.
// depth 0 = a normal trail node. A node at depth MAX_NODE_DEPTH cannot be
// broken down again. Shared between the server route and the frontend
// drawer so they can never disagree about where the line is.
export const MAX_NODE_DEPTH = 2;
