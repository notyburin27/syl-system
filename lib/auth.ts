import NextAuth, { DefaultSession } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcrypt"
import { prisma } from "./prisma"
import { z } from "zod"

// Extend NextAuth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      username: string
      role: string
      name?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    id: string
    username: string
    role: string
    name?: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    username: string
    role: string
  }
}

const loginSchema = z.object({
  username: z.string().min(1, "กรุณากรอกชื่อผู้ใช้"),
  password: z.string().min(1, "กรุณากรอกรหัสผ่าน"),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        username: { label: "ชื่อผู้ใช้", type: "text" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(credentials) {
        try {
          const parsed = loginSchema.safeParse(credentials)
          if (!parsed.success) {
            console.error("Validation failed:", parsed.error)
            return null
          }

          const { username, password } = parsed.data

          const user = await prisma.authUser.findUnique({
            where: { username },
          })

          if (!user) {
            console.error("User not found:", username)
            return null
          }

          const isValid = await compare(password, user.password)
          if (!isValid) {
            console.error("Invalid password for user:", username)
            return null
          }

          return {
            id: user.id,
            username: user.username,
            role: user.role,
            name: user.name,
          }
        } catch (error) {
          console.error("Auth error:", error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.username = user.username
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.username = token.username as string
      }
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const pathname = nextUrl.pathname

      // Public routes
      if (pathname.startsWith("/login")) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/transport-documents", nextUrl))
        }
        return true
      }

      // Protected routes - require authentication
      if (!isLoggedIn) {
        return false // Redirect to login
      }

      // Admin-only routes
      if (pathname.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return Response.redirect(new URL("/transport-documents", nextUrl))
      }

      return true
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
  },
  secret: process.env.NEXTAUTH_SECRET,
})
