import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/documents - List all documents (shared across team)
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const documents = await prisma.transportDocument.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    return NextResponse.json(documents)
  } catch (error: any) {
    console.error('Error fetching documents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/documents - Create new document
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const document = await prisma.transportDocument.create({
      data: {
        title: body.title,
        date: body.date ? new Date(body.date) : null,
        customerName: body.customerName,
        booking: body.booking,
        agent: body.agent,
        shipName: body.shipName,
        invoice: body.invoice,
        containerSize: body.containerSize,
        containerNumber: body.containerNumber,
        sealNumber: body.sealNumber,
        shipping: body.shipping,
        pickupLocation: body.pickupLocation,
        returnLocation: body.returnLocation,
        closingTime: body.closingTime ? new Date(body.closingTime) : null,
        factoryTime: body.factoryTime,
        loadingSlot: body.loadingSlot,
        driverName: body.driverName,
        vehicleRegistration: body.vehicleRegistration,
        phoneNumber: body.phoneNumber,
        remarks: body.remarks,
        createdById: session.user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            username: true,
          },
        },
      },
    })

    return NextResponse.json(document)
  } catch (error: any) {
    console.error('Error creating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
