
import { NextResponse } from "next/server";

export function DefaultSuccessResponse(data: any): NextResponse {
    const res: DefaultResponse = {
        status: 200,
        data,
        error: false,
    }
    return NextResponse.json(res, { status: 200 })
}

export function CustomSuccessResponse(status: number, data: any, error: boolean): NextResponse {
    const res: DefaultResponse = {
        status,
        data,
        error,
    }
    return NextResponse.json(res, { status: status })
}

export function DefaultErrorResponse(message: string): NextResponse {
    const res: DefaultResponse = {
        status: 500,
        data: null,
        error: true,
        message: message,
    };
    return NextResponse.json(res, { status: 500 });
}

export function DefaultUnauthorizedResponse(
    message: string = "Unauthorized",
    data: any = null
): NextResponse {
    const res: DefaultResponse = {
        status: 401,
        data,
        error: true,
        message,
    };
    return NextResponse.json(res, { status: 401 });
}

export function CustomErrorResponse(status: number, message: string, data: any = null): NextResponse {
    const res: DefaultResponse = {
        status,
        data,
        error: true,
        message,
    };
    return NextResponse.json(res, { status: status });
}

export interface DefaultResponse {
    status: number;
    data: any;
    error: boolean;
    message?: string;
    checkout_url?: string;  // Optional checkout_url
}
