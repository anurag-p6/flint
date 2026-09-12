// Flint subgraph client — The Graph audit trail + reputation.
// Queries mirror `subgraphs/QUERIES.graphql`. Totals come from ReceiptMinted
// only (PayoutExecuted is history), so `totalScore`/`totalEarned` here match
// `FlintReceipt.getTotalScore`/`getTotalEarned` with no double-count.
//
// Env: NEXT_PUBLIC_SUBGRAPH_URL (Studio endpoint after `graph deploy`).
// Until it is set, callers must fall back to direct RPC reads — never block
// the demo on indexing.

const URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL ?? "";

export function isSubgraphConfigured(): boolean {
  return URL.length > 0;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!isSubgraphConfigured()) throw new Error("subgraph-not-configured");
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`subgraph-http-${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

export type ContributorProfile = {
  contributor: null | {
    id: string;
    totalScore: string;
    totalEarned: string;
    receiptCount: number;
    programsCompleted: number;
    grantsCompleted: number;
    firstSeenAt: string;
    lastActiveAt: string;
    receipts: {
      tokenId: string;
      repoId: string;
      cycle: string;
      score: string;
      amount: string;
      mode: string;
      timestamp: string;
      txHash: string;
    }[];
  };
};

export async function getContributorProfile(addressHex: string) {
  return gql<ContributorProfile>(
    `query ($id: ID!) {
      contributor(id: $id) {
        id totalScore totalEarned receiptCount programsCompleted grantsCompleted
        firstSeenAt lastActiveAt
        receipts(orderBy: timestamp, orderDirection: desc, first: 25) {
          tokenId repoId cycle score amount mode timestamp txHash
        }
      }
    }`,
    { id: addressHex.toLowerCase() },
  );
}

export type PoolAudit = {
  pool: null | {
    id: string;
    maintainer: string;
    token: string;
    totalAmount: string;
    mode: string;
    cycle: string;
    status: string;
  };
  payouts: { id: string; contributor: { id: string }; cycle: string; amount: string; timestamp: string }[];
  receipts: {
    tokenId: string;
    contributor: { id: string };
    cycle: string;
    score: string;
    amount: string;
    mode: string;
    txHash: string;
  }[];
};

export async function getPoolAudit(repoIdHex: string) {
  return gql<PoolAudit>(
    `query ($id: ID!, $repo: Bytes!) {
      pool(id: $id) { id maintainer token totalAmount mode cycle status }
      payouts(where: { repository: $id }, orderBy: timestamp, orderDirection: asc) {
        id contributor { id } cycle amount timestamp
      }
      receipts(where: { repoId: $repo }, orderBy: timestamp, orderDirection: asc) {
        tokenId contributor { id } cycle score amount mode txHash
      }
    }`,
    { id: repoIdHex.toLowerCase(), repo: repoIdHex.toLowerCase() },
  );
}

export type GrantAudit = {
  grant: null | {
    id: string;
    grantor: string;
    grantee: { id: string; totalScore: string; totalEarned: string };
    token: string;
    totalAmount: string;
    milestoneCount: number;
    amountPaid: string;
    reclaimed: string;
    completed: boolean;
    milestones: {
      id: string;
      milestoneId: string;
      verified: boolean;
      verifiedAt: string;
      releasedAmount: string;
      autoReleased: boolean;
    }[];
  };
  tranches: {
    id: string;
    milestoneId: string;
    grantee: { id: string };
    amount: string;
    auto: boolean;
    timestamp: string;
  }[];
};

export async function getGrantAudit(grantId: string) {
  return gql<GrantAudit>(
    `query ($id: ID!) {
      grant(id: $id) {
        id grantor grantee { id totalScore totalEarned } token totalAmount
        milestoneCount amountPaid reclaimed completed
        milestones(orderBy: milestoneId, orderDirection: asc) {
          id milestoneId verified verifiedAt releasedAmount autoReleased
        }
      }
      tranches(where: { grant: $id }, orderBy: timestamp, orderDirection: asc) {
        id milestoneId grantee { id } amount auto timestamp
      }
    }`,
    { id: grantId },
  );
}
