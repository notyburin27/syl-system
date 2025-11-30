import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/documents/[id] - Get single document
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const document = await prisma.transportDocument.findUnique({
      where: { id: params.id },
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

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json(document)
  } catch (error: any) {
    console.error('Error fetching document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/documents/[id] - Update document
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    const document = await prisma.transportDocument.update({
      where: { id: params.id },
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
    console.error('Error updating document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/documents/[id] - Delete document
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.transportDocument.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting document:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
