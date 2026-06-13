import { Controller, Get, Param, Req, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from "@nestjs/swagger";
import { Request, Response } from "express";
import { RateLimit } from "../../common/rate-limit.decorator";
import { DownloadsService } from "./downloads.service";

@ApiTags("downloads")
@ApiBearerAuth()
@Controller("downloads")
export class DownloadsController {
  constructor(private readonly downloadsService: DownloadsService) {}

  @Get(":token")
  @RateLimit({ name: "downloads-token-redeem", limit: 120, windowMs: 60_000 })
  @ApiOperation({
    summary: "Redeem a one-time download token and deliver the material file",
  })
  @ApiParam({ name: "token", type: String })
  redeem(
    @Param("token") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.downloadsService.redeemToken(token, req.user.id, res);
  }
}
