import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import GitHubProvider from "next-auth/providers/github"
import TwitterProvider from "next-auth/providers/twitter"
import CredentialsProvider from "next-auth/providers/credentials"

// Only register a provider if its credentials are present.
// This lets the app run in dev without all OAuth apps set up.
const providers = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  }),

  ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
    ? [GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      })]
    : []),

  ...(process.env.TWITTER_CLIENT_ID && process.env.TWITTER_CLIENT_SECRET
    ? [TwitterProvider({
        clientId: process.env.TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
        version: "2.0",
      })]
    : []),

  CredentialsProvider({
    name: "Email",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null
      if (credentials.password.length < 6) return null
      return {
        id: credentials.email,
        email: credentials.email,
        name: credentials.email.split("@")[0],
      }
    },
  }),
]

const handler = NextAuth({
  providers,

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.id = user.id
      // Store provider so UI can show "signed in with GitHub" etc.
      if (account) token.provider = account.provider
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.provider = token.provider as string
      }
      return session
    },
  },

  pages: {
    signIn: "/auth",
  },

  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
